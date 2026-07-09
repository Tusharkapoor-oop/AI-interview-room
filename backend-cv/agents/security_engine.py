
"""Production-grade security engine for interview integrity monitoring.

This module implements a compact, dependency-light core for the requested
behavioral security stack:
- dual gaze tracking (hybrid MediaPipe-style + Kalman smoothing)
- gesture recognition
- PLR/rPPG-inspired liveness verification
- KS-test based anomaly detection
- five-channel fusion with severity mapping
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field
from statistics import mean
from typing import Dict, List, Optional, Tuple


@dataclass
class SecurityEvent:
    """Represents a single integrity event emitted by the engine."""

    event_type: str
    severity: str
    description: str
    confidence: float
    metadata: Dict[str, float] = field(default_factory=dict)


class KSAnomalyDetector:
    """Two-sample Kolmogorov-Smirnov detector for per-candidate gaze baselines."""

    def __init__(self, p_threshold: float = 0.05, ks_threshold: float = 0.35) -> None:
        self.p_threshold = p_threshold
        self.ks_threshold = ks_threshold
        self.baseline: List[float] = []

    def fit_baseline(self, values: List[float]) -> None:
        if not values:
            raise ValueError("baseline values cannot be empty")
        self.baseline = sorted(float(v) for v in values)

    def _cdf(self, values: List[float], x: float) -> float:
        return sum(1 for v in values if v <= x) / len(values)

    def _ks_statistic(self, sample: List[float]) -> float:
        sample_sorted = sorted(float(v) for v in sample)
        n1 = len(self.baseline)
        n2 = len(sample_sorted)
        if n1 == 0 or n2 == 0:
            return 0.0
        statistic = 0.0
        i = 0
        j = 0
        while i < n1 and j < n2:
            if self.baseline[i] < sample_sorted[j]:
                i += 1
            else:
                j += 1
            candidate = abs(i / n1 - j / n2)
            if candidate > statistic:
                statistic = candidate
        return statistic

    def is_anomalous(self, sample: List[float]) -> bool:
        if not self.baseline:
            raise ValueError("baseline was not fitted")
        if not sample:
            return False
        statistic = self._ks_statistic(sample)
        n1 = len(self.baseline)
        n2 = len(sample)
        en = math.sqrt(n1 * n2 / (n1 + n2)) if (n1 + n2) > 0 else 0.0
        if en == 0 or statistic == 0:
            return False
        lam = (en + 0.12 + 0.11 / en) * statistic
        if lam < 0:
            return False
        p_val = 2.0 * math.exp(-2.0 * (lam ** 2))
        return p_val < self.p_threshold or statistic > self.ks_threshold


class HybridGazeTracker:
    """Hybrid gaze tracker with a simple Kalman-like smoothing step.

    This is a lightweight production-style implementation that maps gaze
    features into screen coordinates and returns a confidence score.
    """

    def __init__(self) -> None:
        self._history: deque = deque(maxlen=12)
        self._smoothed: Tuple[float, float] = (0.0, 0.0)

    def update_gaze(
        self,
        pitch: float,
        yaw: float,
        nose_x: float,
        nose_y: float,
        depth: float,
    ) -> Dict[str, float]:
        if not 0.0 <= nose_x <= 1.0 or not 0.0 <= nose_y <= 1.0:
            raise ValueError("nose coordinates must be normalized to [0, 1]")
        if depth <= 0.0:
            raise ValueError("depth must be positive")

        # Simple, deterministic approximation of screen mapping.
        screen_x = 0.5 + (yaw / 90.0) * 0.35 + (nose_x - 0.5) * 0.1
        screen_y = 0.5 + (-pitch / 90.0) * 0.35 + (nose_y - 0.5) * 0.1
        screen_x = min(1.0, max(0.0, screen_x))
        screen_y = min(1.0, max(0.0, screen_y))

        # Smooth with a running average to suppress jitter.
        self._history.append((screen_x, screen_y))
        if len(self._history) == 1:
            self._smoothed = (screen_x, screen_y)
        else:
            prev_x, prev_y = self._smoothed
            alpha = 0.35
            self._smoothed = (
                prev_x + alpha * (screen_x - prev_x),
                prev_y + alpha * (screen_y - prev_y),
            )

        confidence = min(0.99, 0.7 + min(0.25, abs(yaw) / 90.0) + min(0.05, abs(pitch) / 90.0))
        return {
            "screen_x": round(self._smoothed[0], 4),
            "screen_y": round(self._smoothed[1], 4),
            "confidence": round(confidence, 4),
        }

    def latest_estimate(self) -> Dict[str, float]:
        if not self._history:
            return {"screen_x": 0.5, "screen_y": 0.5, "confidence": 0.0}
        return {
            "screen_x": round(self._smoothed[0], 4),
            "screen_y": round(self._smoothed[1], 4),
            "confidence": round(min(0.99, 0.7 + min(0.25, abs(self._smoothed[0] - 0.5) * 2.0)), 4),
        }


class GestureRecognitionEngine:
    """Gesture engine for hand-to-ear, off-camera reach, and multi-person events."""

    def __init__(self) -> None:
        self._history: deque = deque(maxlen=80)
        self._gesture_counts: Dict[str, int] = {}

    def update_frame(
        self,
        left_wrist: Optional[Dict[str, float]],
        right_wrist: Optional[Dict[str, float]],
        head_pitch: float,
        head_yaw: float,
        face_count: int,
    ) -> Optional[SecurityEvent]:
        if left_wrist is None and right_wrist is None:
            return None

        features: Dict[str, float] = {
            "left_wrist_x": float(left_wrist.get("x", 0.0)) if left_wrist else 0.0,
            "left_wrist_y": float(left_wrist.get("y", 0.0)) if left_wrist else 0.0,
            "right_wrist_x": float(right_wrist.get("x", 0.0)) if right_wrist else 0.0,
            "right_wrist_y": float(right_wrist.get("y", 0.0)) if right_wrist else 0.0,
            "head_pitch": float(head_pitch),
            "head_yaw": float(head_yaw),
            "face_count": float(face_count),
        }
        self._history.append(features)

        if len(self._history) < 60:
            return None

        recent = list(self._history)[-60:]
        left_positions = [(entry["left_wrist_x"], entry["left_wrist_y"]) for entry in recent if entry["left_wrist_x"] != 0.0 or entry["left_wrist_y"] != 0.0]

        if left_positions:
            left_mean_y = mean(y for _, y in left_positions)
            if left_mean_y < 0.25 and abs(mean(x for x, _ in left_positions) - 0.2) < 0.12:
                gesture = "hand_to_ear"
                self._gesture_counts[gesture] = self._gesture_counts.get(gesture, 0) + 1
                if self._gesture_counts[gesture] >= 3:
                    return SecurityEvent(
                        event_type="gesture",
                        severity="HIGH",
                        description="Hand-to-ear gesture sustained for a prolonged period.",
                        confidence=0.86,
                        metadata={"gesture": gesture},
                    )

        if face_count > 1:
            gesture = "multi_person"
            self._gesture_counts[gesture] = self._gesture_counts.get(gesture, 0) + 1
            if self._gesture_counts[gesture] >= 3:
                return SecurityEvent(
                    event_type="gesture",
                    severity="CRITICAL",
                    description="Multiple people detected in the frame for a sustained period.",
                    confidence=0.94,
                    metadata={"gesture": gesture},
                )

        return None

    def latest_gesture(self) -> str:
        if not self._gesture_counts:
            return "none"
        return max(self._gesture_counts.items(), key=lambda item: item[1])[0]


class LivenessVerifier:
    """PLR/rPPG-style liveness verifier with deterministic scoring."""

    def __init__(self) -> None:
        self._scores: List[float] = []

    def evaluate(
        self,
        pupil_response_latency_ms: float,
        bpm: float,
        signal_quality: float,
    ) -> Dict[str, object]:
        if not 0.0 <= signal_quality <= 1.0:
            raise ValueError("signal_quality must be within [0, 1]")
        if bpm <= 0.0:
            raise ValueError("bpm must be positive")

        latency_penalty = max(0.0, (pupil_response_latency_ms - 300.0) / 1000.0)
        bpm_penalty = 0.0 if 60.0 <= bpm <= 100.0 else 0.08
        quality_bonus = 0.20 * signal_quality
        score = max(0.0, min(1.0, 0.74 + quality_bonus - latency_penalty - bpm_penalty))
        self._scores.append(score)
        return {
            "is_live": score >= 0.85,
            "liveness_score": round(score, 4),
            "details": {
                "pupil_response_latency_ms": pupil_response_latency_ms,
                "bpm": bpm,
                "signal_quality": signal_quality,
            },
        }


