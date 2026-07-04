import asyncio
import time
from collections import defaultdict


class TokenBucketRateLimiter:
    def __init__(self, rate: float = 10.0, capacity: int = 20):
        self.rate = rate
        self.capacity = capacity
        self._tokens: dict[str, float] = defaultdict(lambda: capacity)
        self._last_refill: dict[str, float] = defaultdict(time.time)
        self._lock = asyncio.Lock()

    async def acquire(self, key: str) -> bool:
        async with self._lock:
            now = time.time()
            elapsed = now - self._last_refill[key]
            self._tokens[key] = min(self.capacity, self._tokens[key] + elapsed * self.rate)
            self._last_refill[key] = now

            if self._tokens[key] >= 1.0:
                self._tokens[key] -= 1.0
                return True
            return False

    def get_wait_time(self, key: str) -> float:
        now = time.time()
        elapsed = now - self._last_refill.get(key, now)
        tokens = min(self.capacity, self._tokens.get(key, self.capacity) + elapsed * self.rate)
        if tokens >= 1.0:
            return 0.0
        return (1.0 - tokens) / self.rate if self.rate > 0 else float("inf")


class IPBasedRateLimiter(TokenBucketRateLimiter):
    async def check_websocket(self, websocket) -> bool:
        client_ip = websocket.client.host
        return await self.acquire(client_ip)
