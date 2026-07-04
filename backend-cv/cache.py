import json
import os
import time
from typing import Optional

import redis.asyncio as aioredis


class RedisCache:
    def __init__(self, url: Optional[str] = None):
        self.url = url or os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self._client: Optional[aioredis.Redis] = None

    async def ensure_connected(self) -> aioredis.Redis:
        if self._client is None:
            self._client = await aioredis.from_url(
                self.url, decode_responses=True, socket_connect_timeout=5
            )
        return self._client

    async def set_json(self, key: str, data: dict, ttl: int = 3600) -> None:
        client = await self.ensure_connected()
        await client.setex(key, ttl, json.dumps(data))

    async def get_json(self, key: str) -> Optional[dict]:
        client = await self.ensure_connected()
        raw = await client.get(key)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return None

    async def delete(self, key: str) -> None:
        client = await self.ensure_connected()
        await client.delete(key)

    async def publish(self, channel: str, message: dict) -> None:
        client = await self.ensure_connected()
        await client.publish(channel, json.dumps(message))

    async def subscribe(self, channel: str):
        client = await self.ensure_connected()
        pubsub = client.pubsub()
        await pubsub.subscribe(channel)
        return pubsub

    async def acquire_lock(self, lock_key: str, ttl: int = 10) -> bool:
        client = await self.ensure_connected()
        result = await client.setnx(lock_key, str(time.time()))
        if result:
            await client.expire(lock_key, ttl)
            return True
        return False

    async def release_lock(self, lock_key: str) -> None:
        await self.delete(lock_key)

    async def close(self) -> None:
        if self._client:
            await self._client.close()
            self._client = None


class SessionStore:
    def __init__(self, cache: RedisCache):
        self.cache = cache

    async def create_session(self, session_id: str, user_id: str, role: str, ttl: int = 3600) -> None:
        await self.cache.set_json(f"session:{session_id}", {
            "user_id": user_id,
            "role": role,
            "created_at": time.time(),
            "last_active": time.time(),
        }, ttl=ttl)

    async def get_session(self, session_id: str) -> Optional[dict]:
        return await self.cache.get_json(f"session:{session_id}")

    async def touch_session(self, session_id: str) -> None:
        data = await self.get_session(session_id)
        if data:
            data["last_active"] = time.time()
            await self.cache.set_json(f"session:{session_id}", data)

    async def delete_session(self, session_id: str) -> None:
        await self.cache.delete(f"session:{session_id}")

    async def get_active_sessions_count(self) -> int:
        client = await self.cache.ensure_connected()
        keys = await client.keys("session:*")
        return len(keys)
