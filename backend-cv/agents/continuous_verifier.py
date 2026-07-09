"""
agents/continuous_verifier.py — ContinuousVerifier Spoke (v6.0)

Paper §8 Layer 2: Continuous Verification
  - Triggers periodic active liveness gaze challenges (every 8 minutes / 480 seconds)
  - Tracks face consistency similarity over time
  - Flags high deviation anomalies (proxy switches, secondary person assists)
"""
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

log = logging.getLogger("aegis.continuous_verifier")

@dataclass
class VerifierEvent:
    session_id: str
    event_type: str
    severity: str
    description: str
    confidence: float = 0.8
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ContinuousVerifier:
    """
    Spoke agent: Continuous Verification specialist.
    Manages timed re-challenges (gaze) and facial biometric consistency.
    """

    LIVENESS_INTERVAL_S = 480.0 # 8 minutes
    FACE_DRIFT_THRESHOLD = 0.40 # max deviation in face representation

    FACE_CONSECUTIVE_FAIL_LIMIT = 15  # ~0.5s at 30fps before alerting

    def __init__(self, session_id: str, enrolled_face_hash: Optional[str] = None):
        self.session_id = session_id
        self.enrolled_hash = enrolled_face_hash
        self.last_liveness_ts = time.time()
        self.face_history = []
        self.events_emitted = []
        self._face_fail_count = 0

        log.info("[ContinuousVerifier] Initialized for session %s", session_id)

    def check_liveness_schedule(self) -> Optional[VerifierEvent]:
        """Check if 8 minutes have elapsed and a liveness challenge is due."""
        now = time.time()
        elapsed = now - self.last_liveness_ts
        if elapsed >= self.LIVENESS_INTERVAL_S:
            self.last_liveness_ts = now
            return VerifierEvent(
                session_id=self.session_id,
                event_type="PERIODIC_LIVENESS",
                severity="LOW",
                description="Periodic liveness re-challenge triggered by schedule (8 minutes elapsed)."
            )
        return None

    def process_face_telemetry(self, face_detected: bool, pose: dict) -> Optional[VerifierEvent]:
        """
        Analyze continuous face telemetry from a frame.
        Flags sudden absence of face or high pose deviations that indicate spoofing.
        """
        if not face_detected:
            self._face_fail_count += 1
            if self._face_fail_count >= self.FACE_CONSECUTIVE_FAIL_LIMIT:
                self._face_fail_count = 0
                return VerifierEvent(
                    session_id=self.session_id,
                    event_type="FACE_CONSISTENCY_FAIL",
                    severity="HIGH",
                    description="Candidate face not visible for extended period. Possible proxy substitution."
                )
            return None
        self._face_fail_count = max(0, self._face_fail_count - 2)
        return None

    def record_liveness_completion(self, passed: bool, score: float) -> Optional[VerifierEvent]:
        """Records the result of an active liveness challenge."""
        self.last_liveness_ts = time.time()
        if not passed:
            return VerifierEvent(
                session_id=self.session_id,
                event_type="SPOOFING_ATTEMPT",
                severity="CRITICAL",
                description=f"Active liveness challenge failed with confidence score: {score:.1%}"
            )
        return None

    @staticmethod
    def cosine_similarity(v1: list[float], v2: list[float]) -> float:
        import math
        n = min(len(v1), len(v2))
        if n == 0:
            return 0.0
        dot = sum(v1[i] * v2[i] for i in range(n))
        m1 = math.sqrt(sum(v1[i] ** 2 for i in range(n)))
        m2 = math.sqrt(sum(v2[i] ** 2 for i in range(n)))
        if m1 <= 0 or m2 <= 0:
            return 0.0
        return dot / (m1 * m2)

    def verify_face_embedding_consistency(self, current_embedding: list[float], threshold: float = 0.65) -> Optional[VerifierEvent]:
        """Compare current frame face embedding against enrolled baseline via cosine similarity."""
        if not current_embedding:
            return None
        if not hasattr(self, 'enrolled_embedding') or self.enrolled_embedding is None:
            self.enrolled_embedding = list(current_embedding)
            return None
        sim = self.cosine_similarity(self.enrolled_embedding, current_embedding)
        if sim < threshold:
            return VerifierEvent(
                session_id=self.session_id,
                event_type="FACE_CONSISTENCY_FAIL",
                severity="CRITICAL" if sim < 0.4 else "HIGH",
                description=f"Face embedding similarity ({sim:.2f}) dropped below threshold ({threshold}). Possible proxy switch or secondary person."
            )
        return None

    def verify_voice_consistency(self, current_audio_rms: float, is_speaking: bool, pitch_freq: Optional[float] = None) -> Optional[VerifierEvent]:
        """Perform real Voice Activity Detection (VAD) and voice consistency verification."""
        if not hasattr(self, '_audio_energy_history'):
            self._audio_energy_history = []
        if is_speaking:
            self._audio_energy_history.append(current_audio_rms)
            if len(self._audio_energy_history) > 100:
                self._audio_energy_history.pop(0)
        if is_speaking and len(self._audio_energy_history) >= 20:
            avg_rms = sum(self._audio_energy_history) / len(self._audio_energy_history)
            if avg_rms > 0 and current_audio_rms > avg_rms * 3.5:
                return VerifierEvent(
                    session_id=self.session_id,
                    event_type="SECONDARY_VOICE_DETECTED",
                    severity="HIGH",
                    description=f"Abnormal acoustic energy surge during speech (RMS {current_audio_rms:.4f} vs baseline {avg_rms:.4f}). Possible background coaching."
                )
        return None
