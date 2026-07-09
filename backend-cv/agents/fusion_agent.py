from typing import Dict, Any, List


class BehavioralChannelScores:
    def __init__(
        self,
        gaze_risk: float = 0.0,
        baseline_risk: float = 0.0,
        kinematic_risk: float = 0.0,
        liveness_risk: float = 0.0,
        deepfake_risk: float = 0.0,
    ):
        self.gaze_risk = max(0.0, min(1.0, float(gaze_risk)))
        self.baseline_risk = max(0.0, min(1.0, float(baseline_risk)))
        self.kinematic_risk = max(0.0, min(1.0, float(kinematic_risk)))
        self.liveness_risk = max(0.0, min(1.0, float(liveness_risk)))
        self.deepfake_risk = max(0.0, min(1.0, float(deepfake_risk)))


class TemporalWindowScore:
    def __init__(self, timestamp_s: float, scores: BehavioralChannelScores):
        self.timestamp_s = timestamp_s
        self.scores = scores


MIN_CHANNELS_TO_FLAG = 3
CHANNEL_NAMES = ["gaze_risk", "baseline_risk", "kinematic_risk", "liveness_risk", "deepfake_risk"]
CHANNEL_FLAG_THRESHOLD = 0.40


class FusionAgentEvaluator:

    def __init__(
        self,
        weights: Dict[str, float] = None,
        termination_threshold: float = 0.65,
        n_required_channels: int = MIN_CHANNELS_TO_FLAG,
        temporal_accumulation_windows: int = 3,
        temporal_decay_factor: float = 0.85,
    ):
        if weights is None:
            self.weights = {
                "gaze": 0.20,
                "baseline": 0.20,
                "kinematic": 0.15,
                "liveness": 0.20,
                "deepfake": 0.25,
            }
        else:
            self.weights = weights
        self.termination_threshold = termination_threshold
        self.n_required_channels = n_required_channels
        self.temporal_accumulation_windows = temporal_accumulation_windows
        self.temporal_decay_factor = temporal_decay_factor
        self._temporal_history: List[TemporalWindowScore] = []

    def _count_flagged_channels(self, scores: BehavioralChannelScores) -> int:
        return sum(
            1 for risk_name in CHANNEL_NAMES
            if getattr(scores, risk_name, 0.0) >= CHANNEL_FLAG_THRESHOLD
        )

    def evaluate_session(
        self,
        scores: BehavioralChannelScores,
        window_timestamp_s: float = None,
    ) -> Dict[str, Any]:
        if window_timestamp_s is not None:
            self._temporal_history.append(TemporalWindowScore(window_timestamp_s, scores))
            max_history = self.temporal_accumulation_windows
            if len(self._temporal_history) > max_history:
                self._temporal_history.pop(0)

        composite_risk = (
            self.weights["gaze"] * scores.gaze_risk
            + self.weights["baseline"] * scores.baseline_risk
            + self.weights["kinematic"] * scores.kinematic_risk
            + self.weights["liveness"] * scores.liveness_risk
            + self.weights["deepfake"] * scores.deepfake_risk
        )
        composite_risk = round(min(1.0, max(0.0, composite_risk)), 4)
        integrity_posterior = round(1.0 - composite_risk, 4)

        # === N>=3 rule: at least N channels must independently flag ===
        flagged_channel_count = self._count_flagged_channels(scores)
        n_rule_violation = flagged_channel_count >= self.n_required_channels

        # === Temporal accumulation: risk trending over time ===
        temporal_risk = 0.0
        if len(self._temporal_history) >= 2:
            weighted_sum = 0.0
            total_weight = 0.0
            for i, window in enumerate(self._temporal_history):
                w = self.temporal_decay_factor ** (len(self._temporal_history) - 1 - i)
                ws = (
                    self.weights["gaze"] * window.scores.gaze_risk
                    + self.weights["baseline"] * window.scores.baseline_risk
                    + self.weights["kinematic"] * window.scores.kinematic_risk
                    + self.weights["liveness"] * window.scores.liveness_risk
                    + self.weights["deepfake"] * window.scores.deepfake_risk
                )
                weighted_sum += w * ws
                total_weight += w
            temporal_risk = round(weighted_sum / total_weight, 4) if total_weight > 0 else composite_risk

        # === Final decision ===
        violation_flagged = (
            composite_risk >= self.termination_threshold
            or n_rule_violation
        )

        contributing_channels = []
        for name, key in [("Gaze", scores.gaze_risk), ("Baseline", scores.baseline_risk),
                          ("Kinematic", scores.kinematic_risk), ("Liveness", scores.liveness_risk),
                          ("Deepfake", scores.deepfake_risk)]:
            if key >= 0.4:
                contributing_channels.append(f"{name}({key:.2f})")

        return {
            "composite_risk_score": composite_risk,
            "temporal_accumulated_risk": temporal_risk,
            "integrity_posterior": integrity_posterior,
            "channel_breakdown": {
                "gaze_risk": scores.gaze_risk,
                "baseline_risk": scores.baseline_risk,
                "kinematic_risk": scores.kinematic_risk,
                "liveness_risk": scores.liveness_risk,
                "deepfake_risk": scores.deepfake_risk,
            },
            "flagged_channel_count": flagged_channel_count,
            "n_required_channels": self.n_required_channels,
            "n_rule_violation": n_rule_violation,
            "flagged_contributing_channels": contributing_channels,
            "session_terminated": violation_flagged,
            "temporal_windows_evaluated": len(self._temporal_history),
            "explanation": (
                f"ALERT: Session composite risk ({composite_risk:.2f}) exceeds threshold. "
                + (f"N>=3 rule triggered ({flagged_channel_count}/{self.n_required_channels} channels). "
                   if n_rule_violation else "")
                if violation_flagged
                else f"Session verified authentic with posterior confidence {integrity_posterior:.1%}."
            ),
        }

    def evaluate_session_viproctor(
        self,
        audio_spectrogram_features: List[float],
        video_swin_features: List[float],
        cross_modal_attention: List[float],
    ) -> Dict[str, Any]:
        """
        Integration path for ViProctor-Transformer (SN Computer Science, Jan 2026).
        Currently a stub — replaces weighted fusion with cross-modal transformer when deployed.
        """
        return {
            "viProctor_available": False,
            "viProctor_enabled": False,
            "explanation": (
                "ViProctor-Transformer integration path defined. "
                "Deploy when cross-modal attention model is trained on MSU OEP dataset."
            ),
        }

    def reset_temporal_history(self):
        self._temporal_history = []
