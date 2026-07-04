import os
import secrets
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger("aegis.auth")

SKIP_AUTH = os.getenv("SKIP_AUTH", "").lower() in ("1", "true", "yes")

from fastapi import HTTPException, WebSocket, status
from jose import JWTError, jwt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET or len(JWT_SECRET) < 32:
    if not SKIP_AUTH:
        log.warning("JWT_SECRET not set in environment (or < 32 chars). Generated ephemeral 256-bit secret for this session.")
    JWT_SECRET = secrets.token_hex(32)
    os.environ["JWT_SECRET"] = JWT_SECRET

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


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SIGNING_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
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
    if SKIP_AUTH:
        return {"sub": "dev-user", "role": "ADMIN", "email": "dev@aegis.local"}
    token = websocket.query_params.get("token")
    if not token:
        token = websocket.headers.get("authorization", "").replace("Bearer ", "")
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
    origin = websocket.headers.get("origin", "")
    if allowed_origins and origin not in allowed_origins:
        raise HTTPException(status_code=403, detail="Origin not allowed")
