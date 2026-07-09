"""
agents/fraud_agent.py — Layer 6: AI Fraud Detection (Backend)

Paper §8 Layer 6:
  - Aggregates all signals into a composite FraudScore
  - Deepfake verdict generation
  - Multi-modal fusion: CV + Audio + Digital signals
  - Advisory scoring only — never auto-reject
"""
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

log = logging.getLogger("aegis.fraud_agent")

# ── Signal weights from paper threat model ─────────────────────
SIGNAL_WEIGHTS = {
    "GAZE_ANOMALY":             0.20,
    "SECONDARY_PERSON":         0.20,
    "TAB_SWITCH":               0.15,
    "PASTE_ANOMALY":            0.15,
    "TYPING_ANOMALY":           0.15,
    "SECONDARY_VOICE_DETECTED": 0.10,
    "VIRTUAL_CAM":              0.05,
    "HAND_ANOMALY":             0.08,
    "DEVTOOLS_OPEN":            0.05,
    "WINDOW_BLUR":              0.03,
    "FACE_CONSISTENCY_FAIL":    0.20,
    "DEEPFAKE_SUSPECTED":       0.40,
    "ENV_SCAN_SKIPPED":         0.05,
    "HEAD_TURN":                0.12,
    "BLINK_ANOMALY":            0.10,
    "ATTENTION_DRIFT":          0.08,
    "LIGHTING_ANOMALY":         0.05,
    "OBJECT_DETECTED":          0.12,
    "WHITESPACE_FIXATION":      0.25,
    "BEHAVIORAL_INCONSISTENCY": 0.30,
    "PLR_FAILURE":              0.20,
    "LAG_LOOP":                 0.20,
    "CHALLENGE_RESPONSE_FAIL":  0.30,
    "OVERLAY_CLUSTER":          0.25,
}

SEVERITY_MULTIPLIERS = {
    "CRITICAL": 3.5,
    "HIGH":     2.0,
    "MEDIUM":   1.0,
    "LOW":      0.4,
}

VERDICT_THRESHOLDS = {
    75: "HIGH_RISK",
    45: "MODERATE_RISK",
    20: "LOW_RISK",
    0:  "CLEAN",
}


@dataclass
class FraudAssessment:
    session_id:       str
    fraud_score:      float             # 0-100
    verdict:          str               # CLEAN | LOW_RISK | MODERATE_RISK | HIGH_RISK
    deepfake_flag:    bool
    requires_hitl:    bool
    signal_breakdown: dict = field(default_factory=dict)
    top_signals:      list = field(default_factory=list)
    generated_at:     str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    notes:            str = ""


class FraudAgent:
    """
    Spoke agent: Multi-modal Fraud Detection.

    Receives aggregated risk events from CVAgent, DigitalSecurity hook
    (forwarded via WebSocket), and AudioAnalysis and produces a composite
    FraudAssessment that feeds the recruiter's Command Center.

    IMPORTANT: This agent produces ADVISORY assessments only.
    No hiring decision is made automatically. All HIGH_RISK or
    MODERATE_RISK assessments are escalated to the HITL layer.
    """

    def __init__(self, session_id: str):
        self.session_id = session_id
        self._events: list[dict] = []
        log.info("[FraudAgent] Initialized for session %s", session_id)

    def ingest_event(self, event: dict):
        """Add a risk event from any agent or frontend layer."""
        self._events.append({
            "type":      event.get("event_type", event.get("type", "UNKNOWN")),
            "severity":  event.get("severity", "LOW"),
            "timestamp": event.get("timestamp", datetime.now(timezone.utc).isoformat()),
            "fraud_signal": event.get("fraud_signal", False),
        })

    def compute_assessment(self, session_duration_seconds: int = 1) -> FraudAssessment:
        """
        Compute full fraud assessment from all ingested events.
        Called at session end or on-demand by recruiter.
        """
        if not self._events:
            return FraudAssessment(
                session_id=self.session_id, fraud_score=0.0,
                verdict="CLEAN", deepfake_flag=False, requires_hitl=False,
                notes="No suspicious signals detected.",
            )

        # Group by type
        grouped = {}
        for ev in self._events:
            t = ev["type"]
            if t not in grouped:
                grouped[t] = []
            grouped[t].append(ev)

        # Score each signal
        breakdown = {}
        raw_score = 0.0
        deepfake_flag = False
        top_signals = []

        severity_order = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}
        duration_hours = max(session_duration_seconds, 1) / 3600.0

        for ev_type, events in grouped.items():
            weight = SIGNAL_WEIGHTS.get(ev_type, 0.05)
            worst_sev = max(events, key=lambda e: severity_order.get(e["severity"], 0))["severity"]
            multiplier = SEVERITY_MULTIPLIERS.get(worst_sev, 1.0)
            # Frequency penalty based on event rate per hour, not raw count
            event_rate = len(events) / duration_hours
            freq_factor = min(1.0 + max(event_rate - 1, 0) * 0.15, 2.5)
            contribution = min(weight * multiplier * freq_factor * 100, weight * 3.5 * 100)

            breakdown[ev_type] = {
                "count":        len(events),
                "worst_sev":    worst_sev,
                "contribution": round(contribution, 1),
            }
            raw_score += contribution
            top_signals.append({"type": ev_type, "count": len(events), "score": round(contribution, 1)})

            if ev_type in ("DEEPFAKE_SUSPECTED", "CHALLENGE_RESPONSE_FAIL", "BEHAVIORAL_INCONSISTENCY"):
                deepfake_flag = True

        final_score = min(round(raw_score, 1), 100.0)

        # Determine verdict
        verdict = "CLEAN"
        for threshold, label in sorted(VERDICT_THRESHOLDS.items(), reverse=True):
            if final_score >= threshold:
                verdict = label
                break

        requires_hitl = (
            verdict in ("HIGH_RISK", "MODERATE_RISK") or
            deepfake_flag or
            any(ev["type"] == "SECONDARY_PERSON" for ev in self._events) or
            len(self._events) > 15
        )

        top_signals.sort(key=lambda s: s["score"], reverse=True)

        notes = self._generate_notes(verdict, deepfake_flag, top_signals[:3])

        assessment = FraudAssessment(
            session_id       = self.session_id,
            fraud_score      = final_score,
            verdict          = verdict,
            deepfake_flag    = deepfake_flag,
            requires_hitl    = requires_hitl,
            signal_breakdown = breakdown,
            top_signals      = top_signals[:5],
            notes            = notes,
        )

        log.info("[FraudAgent] Assessment: score=%.1f verdict=%s hitl=%s",
                 final_score, verdict, requires_hitl)
        return assessment

    def _generate_notes(self, verdict: str, deepfake: bool, top_signals: list) -> str:
        if not top_signals:
            return "Session completed with no fraud indicators."

        parts = []
        if deepfake:
            parts.append("CRITICAL: Deepfake/pre-recorded video artifacts detected.")
        if verdict == "HIGH_RISK":
            parts.append("Multiple high-severity fraud signals detected. Mandatory human review required before any hiring decision.")
        elif verdict == "MODERATE_RISK":
            parts.append("Moderate fraud indicators present. Human review recommended.")
        elif verdict == "LOW_RISK":
            parts.append("Minor anomalies detected — likely benign. Standard review applies.")

        if top_signals:
            top = top_signals[0]
            parts.append(f"Primary signal: {top['type']} ({top['count']} occurrence(s)).")

        parts.append("NOTE: This assessment is advisory. All decisions require human judgment. Candidates may appeal any flag.")
        return " ".join(parts)

    def get_event_count(self) -> int:
        return len(self._events)

    def reset(self):
        self._events = []
