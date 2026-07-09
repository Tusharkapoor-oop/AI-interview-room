"""
fusion.py — Canonical 6-channel behavioral fusion engine.

All public exports consolidated here. New code should import
from agents.fusion only.

Consolidated from:
  - fusion_engine.py :: FiveChannelFusionEngine
  - security_engine.py :: FiveChannelFusionEngine
  - fusion_agent.py :: FusionAgentEvaluator
  - fusion.py :: FusionEngine

6th channel (whitespace) added per AEGIS §11.1 — overlay detection via whitespace fixation.
Extra channel for N>=3 rule diversity without reducing per-channel sensitivity.

Modes:
  - evaluate(): Simple weighted-average composite risk (backward-compatible)
  - evaluate_windowed(): N>=3 rule with 10s sliding window (production)
  - evaluate_accumulated(): Temporal accumulation across windows (research)
"""

from typing import Dict, Any, List


CANONICAL_FUSION_WEIGHTS = {
    "gaze": 0.225,
    "baseline": 0.180,
    "kinematic": 0.135,
    "liveness": 0.225,
    "deepfake": 0.135,
    "whitespace": 0.100,
}

CHANNEL_NAMES = ["GAZE", "GESTURE", "AUDIO", "KEYSTROKE", "ENVIRONMENT", "WHITESPACE"]
CHANNEL_WEIGHTS = {"GAZE": 0.225, "GESTURE": 0.180, "AUDIO": 0.180, "KEYSTROKE": 0.180, "ENVIRONMENT": 0.135, "WHITESPACE": 0.100}


class FusionEngine:
    """Canonical fusion engine with multiple evaluation modes."""

    def __init__(
        self,
        weights: Dict[str, float] = None,
        termination_threshold: float = 0.65,
        n_required_channels: int = 3,
        temporal_accumulation_windows: int = 3,
        temporal_decay_factor: float = 0.85,
        window_duration_sec: float = 10.0,
    ):
        self.weights = weights if weights else CANONICAL_FUSION_WEIGHTS.copy()
        self.termination_threshold = termination_threshold
        self.n_required_channels = n_required_channels
        self.temporal_accumulation_windows = temporal_accumulation_windows
        self.temporal_decay_factor = temporal_decay_factor
        self.window_duration = window_duration_sec

        self._packet_queue: List[tuple] = []
        self._temporal_history: List[dict] = []

    def evaluate(self, channel_risks: Dict[str, float]) -> Dict[str, Any]:
        """Simple weighted-average composite risk score. Backward-compatible with fusion.py."""
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

    def process_packet(self, channel_id: str, timestamp: float, anomaly_score: float, details: str = "", is_triggered: bool = False) -> Dict[str, Any]:
        """Add a channel packet and evaluate with N>=3 windowed rule. Returns fusion decision dict."""
        self._packet_queue.append((channel_id, timestamp, anomaly_score, is_triggered, details))
        self._packet_queue = [p for p in self._packet_queue if timestamp - p[1] <= self.window_duration]

        latest_scores: Dict[str, float] = {ch: 0.0 for ch in CHANNEL_NAMES}
        triggered_channels: set = set()
        details_list: List[str] = []

        for p in self._packet_queue:
            cid, ts, ascore, trig, det = p
            if ascore > latest_scores.get(cid, 0.0):
                latest_scores[cid] = ascore
            if trig:
                triggered_channels.add(cid)
                if det and det not in details_list:
                    details_list.append(f"[{cid}] {det}")

        weighted_penalty = sum(CHANNEL_WEIGHTS.get(ch, 0.0) * latest_scores.get(ch, 0.0) for ch in CHANNEL_NAMES)
        integrity_score = max(0.0, min(100.0, (1.0 - weighted_penalty) * 100.0))
        N = len(triggered_channels)

        if N <= 1:
            action = "SILENT_LOG"
        elif N == 2:
            action = "LOW_LOG"
        elif N == 3:
            action = "MEDIUM_FLAG"
        elif N == 4:
            action = "HIGH_FLAG_REVIEW"
        else:
            action = "CRITICAL_PAUSE"

        desc = "; ".join(details_list) if details_list else "All channels nominal."

        return {
            "action_level": action,
            "channel_deviations": N,
            "integrity_score": round(integrity_score, 1),
            "triggered_channels": sorted(list(triggered_channels)),
            "description": desc,
        }

    def evaluate_windowed(self, channel_scores: Dict[str, float]) -> Dict[str, Any]:
        """Evaluate with N>=3 rule: at least N channels must independently exceed threshold."""
        flagged_count = sum(1 for v in channel_scores.values() if v >= 0.4)
        composite_risk = sum(
            self.weights.get(ch, 0.0) * max(0.0, min(1.0, v))
            for ch, v in channel_scores.items()
        )
        composite_risk = round(min(1.0, max(0.0, composite_risk)), 4)
        n_rule_violation = flagged_count >= self.n_required_channels
        violation_flagged = composite_risk >= self.termination_threshold or n_rule_violation

        return {
            "composite_risk_score": composite_risk,
            "flagged_channel_count": flagged_count,
            "n_required_channels": self.n_required_channels,
            "n_rule_violation": n_rule_violation,
            "session_terminated": violation_flagged,
        }

    def add_temporal_window(self, window_scores: Dict[str, float], timestamp: float) -> None:
        """Add a temporal window for accumulated risk evaluation."""
        self._temporal_history.append({"scores": window_scores, "ts": timestamp})
        if len(self._temporal_history) > self.temporal_accumulation_windows:
            self._temporal_history.pop(0)

    def evaluate_accumulated(self) -> Dict[str, Any]:
        """Temporal accumulation: risk trending over time with decay."""
        if len(self._temporal_history) < 2:
            return {"temporal_accumulated_risk": 0.0, "temporal_windows_evaluated": len(self._temporal_history)}

        weighted_sum = 0.0
        total_weight = 0.0
        for i, window in enumerate(self._temporal_history):
            w = self.temporal_decay_factor ** (len(self._temporal_history) - 1 - i)
            ws = sum(self.weights.get(ch, 0.0) * v for ch, v in window["scores"].items())
            weighted_sum += w * ws
            total_weight += w

        temporal_risk = round(weighted_sum / total_weight, 4) if total_weight > 0 else 0.0
        return {
            "temporal_accumulated_risk": temporal_risk,
            "temporal_windows_evaluated": len(self._temporal_history),
        }

    def reset(self):
        self._packet_queue.clear()
        self._temporal_history.clear()
