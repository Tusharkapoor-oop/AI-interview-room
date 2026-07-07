import asyncio
import os
import time
from collections import defaultdict


# H-5: Only trust X-Forwarded-For when connection originates from known proxy
_TRUSTED_PROXY_CIDRS: list[str] | None = None


def _load_trusted_proxies() -> list[str]:
    global _TRUSTED_PROXY_CIDRS
    if _TRUSTED_PROXY_CIDRS is not None:
        return _TRUSTED_PROXY_CIDRS
    raw = os.getenv("TRUSTED_PROXIES", "")
    if raw:
        _TRUSTED_PROXY_CIDRS = [c.strip() for c in raw.split(",") if c.strip()]
    else:
        _TRUSTED_PROXY_CIDRS = []
    return _TRUSTED_PROXY_CIDRS


def _is_trusted_proxy(host: str) -> bool:
    proxies = _load_trusted_proxies()
    if not proxies:
        return False
    return host in proxies


def _get_client_ip(request=None, websocket=None) -> str:
    """Extract real client IP.

    Only trusts X-Forwarded-For when the direct connection comes from a
    trusted proxy (configured via TRUSTED_PROXIES env var, comma-separated).
    Falls back to direct connection IP when untrusted or unavailable.
    """
    direct_host = None
    if websocket:
        direct_host = websocket.client.host if websocket.client else None
    elif request:
        direct_host = request.client.host if request.client else None

    if direct_host and _is_trusted_proxy(direct_host):
        forwarded = None
        if websocket:
            forwarded = websocket.headers.get("x-forwarded-for", "")
        elif request:
            forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            ips = [ip.strip() for ip in forwarded.split(",") if ip.strip()]
            if ips:
                return ips[0]

    if direct_host:
        return direct_host
    return "unknown"


class TokenBucketRateLimiter:
    def __init__(self, rate: float = 10.0, capacity: int = 20):
        self.rate = rate
        self.capacity = capacity
        self._tokens: dict[str, float] = defaultdict(lambda: capacity)
        self._last_refill: dict[str, float] = defaultdict(time.monotonic)
        self._lock = asyncio.Lock()

    async def acquire(self, key: str) -> bool:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_refill[key]
            self._tokens[key] = min(self.capacity, self._tokens[key] + elapsed * self.rate)
            self._last_refill[key] = now

            if self._tokens[key] >= 1.0:
                self._tokens[key] -= 1.0
                return True
            return False

    def get_wait_time(self, key: str) -> float:
        now = time.monotonic()
        elapsed = now - self._last_refill.get(key, now)
        tokens = min(self.capacity, self._tokens.get(key, self.capacity) + elapsed * self.rate)
        if tokens >= 1.0:
            return 0.0
        return (1.0 - tokens) / self.rate if self.rate > 0 else float("inf")


class IPBasedRateLimiter(TokenBucketRateLimiter):
    async def check_websocket(self, websocket) -> bool:
        # H-9: Use X-Forwarded-For if behind a proxy
        client_ip = _get_client_ip(websocket=websocket)
        return await self.acquire(client_ip)

    async def check_request(self, request) -> bool:
        """Check rate limit for REST requests."""
        client_ip = _get_client_ip(request=request)
        return await self.acquire(client_ip)
