"""
fusion.py — Single canonical 5-channel fusion engine.
Consolidates 3 duplicate implementations from:
  - security_engine.py
  - fusion_engine.py
  - fusion_agent.py
"""
from typing import Dict, Any


CANONICAL_FUSION_WEIGHTS = {
    "gaze": 0.25,
    "baseline": 0.20,
    "kinematic": 0.15,
    "liveness": 0.25,
    "deepfake": 0.15,
}


class FusionEngine:
    def __init__(
        self,
        weights: Dict[str, float] = None,
        termination_threshold: float = 0.65,
    ):
        self.weights = weights if weights else CANONICAL_FUSION_WEIGHTS.copy()
        self.termination_threshold = termination_threshold

    def evaluate(self, channel_risks: Dict[str, float]) -> Dict[str, Any]:
        composite_risk = sum(
            self.weights.get(ch, 0.0) * max(0.0, min(1.0, risk))
            for ch, risk in channel_risks.items()
        )
        composite_risk = round(min(1.0, max(0.0, composite_risk)), 4)
        integrity_posterior = round(1.0 - composite_risk, 4)
        violation_flagged = composite_risk >= self.termination_threshold

        contributing = [
            f"{ch}({risk:.2f})"
            for ch, risk in channel_risks.items()
            if risk >= 0.4
        ]

        return {
            "composite_risk_score": composite_risk,
            "integrity_posterior": integrity_posterior,
            "channel_breakdown": channel_risks,
            "flagged_contributing_channels": contributing,
            "session_terminated": violation_flagged,
            "explanation": (
                f"Session composite risk ({composite_risk:.2f}) exceeds threshold."
                if violation_flagged
                else f"Session verified — posterior confidence {integrity_posterior:.1%}."
            ),
        }
