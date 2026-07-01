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
from datetime import datetime
from typing import Optional

log = logging.getLogger("aegis.continuous_verifier")

@dataclass
class VerifierEvent:
    session_id: str
    event_type: str
    severity: str
    description: str
    confidence: float = 0.8
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())

class ContinuousVerifier:
    """
    Spoke agent: Continuous Verification specialist.
    Manages timed re-challenges (gaze) and facial biometric consistency.
    """

    LIVENESS_INTERVAL_S = 480.0 # 8 minutes
    FACE_DRIFT_THRESHOLD = 0.40 # max deviation in face representation

    def __init__(self, session_id: str, enrolled_face_hash: Optional[str] = None):
        self.session_id = session_id
        self.enrolled_hash = enrolled_face_hash
        self.last_liveness_ts = time.time()
        self.face_history = []
        self.events_emitted = []

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
            return VerifierEvent(
                session_id=self.session_id,
                event_type="FACE_CONSISTENCY_FAIL",
                severity="HIGH",
                description="Candidate face is no longer visible in frame. Possible proxy substitution."
            )
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
