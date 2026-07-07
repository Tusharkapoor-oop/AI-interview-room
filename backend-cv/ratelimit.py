import asyncio
import time
from collections import defaultdict


def _get_client_ip(request=None, websocket=None) -> str:
    """H-9: Extract real client IP, respecting X-Forwarded-For behind proxies."""
    forwarded = None
    if websocket:
        forwarded = websocket.headers.get("x-forwarded-for", "")
    elif request:
        forwarded = request.headers.get("x-forwarded-for", "")

    if forwarded:
        # X-Forwarded-For can be "client, proxy1, proxy2" — take the first
        ips = [ip.strip() for ip in forwarded.split(",") if ip.strip()]
        if ips:
            return ips[0]

    if websocket:
        return websocket.client.host
    if request:
        return request.client.host
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
