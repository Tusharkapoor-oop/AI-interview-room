"""
frame_skipper.py — Phase 6.8

Adaptive frame skipping to achieve target 10 FPS processing.
Serves as throttle between raw camera feed and CV inference pipeline.
"""
import time
from typing import Optional


class FrameSkipper:
    """
    Adaptive frame skipper targeting a configurable processing FPS.

    Maintains a sliding-window average of actual processing time and
    calculates drop ratio to stay at or below target_fps.

    Usage:
        skipper = FrameSkipper(target_fps=10.0)
        while stream:
            if not skipper.should_process():
                continue  # skip this frame
            result = process_frame(frame)
            skipper.record_processed()
    """

    def __init__(self, target_fps: float = 10.0, window_size: int = 30):
        if target_fps <= 0:
            target_fps = 10.0
        self._target_interval = 1.0 / target_fps
        self._window_size = window_size
        self._processing_times: list[float] = []
        self._last_process_time: Optional[float] = None
        self._frames_seen = 0
        self._frames_processed = 0

    def should_process(self) -> bool:
        """Return True if this frame should be processed (not skipped)."""
        now = time.monotonic()
        self._frames_seen += 1

        if self._last_process_time is None:
            self._last_process_time = now
            self._frames_processed += 1
            return True

        elapsed = now - self._last_process_time

        if elapsed >= self._target_interval:
            self._last_process_time = now
            self._frames_processed += 1
            return True

        return False

    def record_processed(self, duration_s: Optional[float] = None):
        """Record a frame processing duration for adaptive adjustment."""
        if duration_s is not None:
            self._processing_times.append(duration_s)
            if len(self._processing_times) > self._window_size:
                self._processing_times.pop(0)

    @property
    def actual_fps(self) -> float:
        """Actual processing rate based on tracked times."""
        if not self._processing_times:
            return 0.0
        avg_time = sum(self._processing_times) / len(self._processing_times)
        return 1.0 / avg_time if avg_time > 0 else 0.0

    @property
    def skip_ratio(self) -> float:
        """Fraction of frames skipped since last reset."""
        if self._frames_seen == 0:
            return 0.0
        return 1.0 - (self._frames_processed / self._frames_seen)

    @property
    def processed_count(self) -> int:
        return self._frames_processed

    @property
    def total_count(self) -> int:
        return self._frames_seen

    def reset(self):
        self._processing_times.clear()
        self._last_process_time = None
        self._frames_seen = 0
        self._frames_processed = 0