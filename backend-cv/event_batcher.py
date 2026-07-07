"""event_batcher.py — Batch DB writes with retry and rollback safety."""
import asyncio
import logging
from collections import deque
from typing import Any, Callable, Optional

log = logging.getLogger("aegis.event_batcher")

MAX_RETRIES = 3


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
        self._retry_queue: deque = deque()

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
            if self.queue or self._retry_queue:
                await self._flush()

    async def _flush(self):
        if not self.queue and not self._retry_queue:
            return

        # Restore retry items back to queue front
        while self._retry_queue:
            self.queue.appendleft(self._retry_queue.popleft())

        db = self.db_session_factory()
        try:
            batch = []
            while self.queue and len(batch) < self.batch_size:
                batch.append(self.queue.popleft())
            db.add_all(batch)
            db.commit()
            log.debug("Flushed %d events", len(batch))
        except Exception as e:
            db.rollback()
            log.error("EventBatcher flush failed (will retry): %s", e)
            # Push back to retry queue
            retry_count = getattr(self, "_retry_counts", {})
            for item in batch:
                key = id(item)
                retry_count[key] = retry_count.get(key, 0) + 1
                if retry_count[key] < MAX_RETRIES:
                    self._retry_queue.append(item)
                else:
                    log.error("EventBatcher dropping event after %d retries: %s", MAX_RETRIES, item)
            self._retry_counts = retry_count
        finally:
            db.close()