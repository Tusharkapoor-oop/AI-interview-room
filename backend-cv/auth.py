# ruff: noqa: E402
import os
import secrets
import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger("aegis.auth")

from fastapi import HTTPException, WebSocket, status
from jose import JWTError, jwt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET or len(JWT_SECRET) < 32:
    raise RuntimeError(
        "JWT_SECRET environment variable is required (min 32 chars). "
        "Set it before starting the server."
    )

# Use RS256 asymmetric signing if RSA keys are configured, else fallback to HS256
_RSA_PRIV_KEY = os.getenv("JWT_RSA_PRIVATE_KEY")
_RSA_PUB_KEY = os.getenv("JWT_RSA_PUBLIC_KEY")

if _RSA_PRIV_KEY and _RSA_PUB_KEY:
    ALGORITHM = "RS256"
    SIGNING_KEY = _RSA_PRIV_KEY.replace("\\n", "\n")
    VERIFICATION_KEY = _RSA_PUB_KEY.replace("\\n", "\n")
else:
    ALGORITHM = "HS256"
    SIGNING_KEY = JWT_SECRET
    VERIFICATION_KEY = JWT_SECRET

ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("JWT_REFRESH_EXPIRE_DAYS", "7"))


# ─── Refresh Token Rotation (Bounded TTLCache) ─────────────────────────────────
from collections import OrderedDict


class _TTLCache(OrderedDict):
    """Bounded TTL cache for refresh token rotation. Prevents OOM (C-10)."""

    def __init__(self, maxlen: int = 10000):
        super().__init__()
        self.maxlen = maxlen

    def add(self, token: str, exp: float) -> None:
        self[token] = exp
        if len(self) > self.maxlen:
            self.popitem(last=False)

    def cleanup(self, now: float) -> int:
        expired = [k for k, v in self.items() if v < now]
        for k in expired:
            del self[k]
        return len(expired)


_used_refresh_tokens = _TTLCache(maxlen=10000)
_refresh_token_lock = threading.Lock()


def mark_refresh_token_used(jti: str, exp: float = 0.0) -> bool:
    """Mark a refresh token as used. Returns False if already used."""
    with _refresh_token_lock:
        if jti in _used_refresh_tokens:
            return False
        _used_refresh_tokens.add(jti, exp)
        return True


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({
        "exp": expire,
        "type": "access",
        "iat": datetime.now(timezone.utc),
        "jti": secrets.token_hex(16),
    })
    return jwt.encode(to_encode, SIGNING_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({
        "exp": expire,
        "type": "refresh",
        "iat": datetime.now(timezone.utc),
        "jti": secrets.token_hex(16),
    })
    return jwt.encode(to_encode, SIGNING_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, VERIFICATION_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


async def get_current_user_from_ws(websocket: WebSocket) -> dict:
    # Try Authorization header first (for non-browser clients)
    auth_header = websocket.headers.get("authorization", "")
    token = auth_header.replace("Bearer ", "").strip()

    # Fallback: Check Sec-WebSocket-Protocol for browser clients
    # Format: "Bearer <token>" or just "<token>"
    if not token:
        proto = websocket.headers.get("sec-websocket-protocol", "")
        if proto.startswith("Bearer "):
            token = proto[7:].strip()
        elif proto and not proto.startswith("http") and not proto.startswith("ws"):
            # Assume it's a bare token if not a standard protocol
            token = proto.strip()

    if not token:
        await websocket.close(code=4001, reason="Missing authentication token")
        raise HTTPException(status_code=401, detail="Missing authentication token")
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            await websocket.close(code=4001, reason="Invalid token type")
            raise HTTPException(status_code=401, detail="Invalid token type")
        return payload
    except HTTPException:
        await websocket.close(code=4001, reason="Invalid or expired token")
        raise


def validate_origin(websocket: WebSocket, allowed_origins: list[str]) -> None:
    origin = (websocket.headers.get("origin", "") or "").lower().rstrip("/")
    if not allowed_origins or "*" in allowed_origins:
        return
    normalized_allowed = [o.lower().rstrip("/") for o in allowed_origins]
    if origin not in normalized_allowed:
        raise HTTPException(status_code=403, detail="Origin not allowed")
