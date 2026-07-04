"""event_batcher.py — Batch DB writes to prevent SQLite lock contention."""
import asyncio
import logging
from collections import deque
from typing import Any, Callable, Optional

log = logging.getLogger("aegis.event_batcher")


class EventBatcher:
    def __init__(
        self,
        db_session_factory: Callable,
        flush_interval: float = 1.0,
        batch_size: int = 20,
    ):
        self.queue: deque = deque()
        self.flush_interval = flush_interval
        self.batch_size = batch_size
        self.db_session_factory = db_session_factory
        self._task: Optional[asyncio.Task] = None
        self._stopped = False

    async def start(self):
        self._stopped = False
        self._task = asyncio.create_task(self._flush_loop())
        log.info("EventBatcher started (interval=%ss, batch=%d)", self.flush_interval, self.batch_size)

    async def stop(self):
        self._stopped = True
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        # Flush remaining
        if self.queue:
            await self._flush()
        log.info("EventBatcher stopped, %d remaining events flushed", len(self.queue))

    async def add(self, obj: Any):
        self.queue.append(obj)
        if len(self.queue) >= self.batch_size:
            await self._flush()

    async def _flush_loop(self):
        while not self._stopped:
            await asyncio.sleep(self.flush_interval)
            if self.queue:
                await self._flush()

    async def _flush(self):
        if not self.queue:
            return
        db = self.db_session_factory()
        try:
            batch = []
            while self.queue and len(batch) < self.batch_size:
                batch.append(self.queue.popleft())
            db.add_all(batch)
            db.commit()
            log.debug("Flushed %d events", len(batch))
        except Exception as e:
            log.error("EventBatcher flush failed: %s", e)
            db.rollback()
        finally:
            db.close()
