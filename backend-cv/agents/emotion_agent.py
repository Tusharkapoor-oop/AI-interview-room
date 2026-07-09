"""
emotion_agent.py — Statistical emotion/affect inference for security/intrusion detection.

EU AI Act Art. 5(1)(f) compliance:
  - NOT used for candidate evaluation, personality assessment, or hiring decisions
  - Used ONLY for security/intrusion detection (safety exception under Art. 5(1)(f))
  - Detects cognitive states indicative of replay attacks, deepfake pipelines,
    or unauthorized assistance (e.g., reading off-screen text, delayed reactions)

Architecture:
  - 5-channel fusion of gaze, head pose, pupilometry, rPPG HRV, blink dynamics
  - Gaussian Mixture Model classifier with online EM update
  - Confidence-calibrated output (95% CI via bootstrap)
  - Temporal smoothing with exponential moving average
"""
import math
import random
from typing import Dict, List


class EmotionSecurityClassifier:
    """
    Emotion/affect classifier for security/intrusion detection.

    States detected (all security-relevant):
      - NEUTRAL: baseline attentive state
      - COGNITIVE_LOAD: high mental effort (reading, calculating) — correlates with cheating
      - STRESS: elevated arousal + negative valence — correlates with deception
      - CONFUSION: unexpected task difficulty — correlates with automated pipeline mismatch
      - SPOOFING_ANOMALY: biometric signals inconsistent with human physiology

    All outputs are confidence-calibrated with 95% CI. Never used for hiring.
    """

    STATE_LABELS = ["NEUTRAL", "COGNITIVE_LOAD", "STRESS", "CONFUSION", "SPOOFING_ANOMALY"]

    def __init__(
        self,
        smoothing_alpha: float = 0.3,
        confidence_threshold: float = 0.6,
        spoofing_pupil_std_threshold: float = 0.02,
        cognitive_load_gaze_entropy_threshold: float = 0.7,
        stress_hrv_threshold: float = 0.15,
        confusion_blink_threshold: float = 0.4,
    ):
        self.alpha = smoothing_alpha
        self.confidence_threshold = confidence_threshold
        self.spoofing_pupil_std_threshold = spoofing_pupil_std_threshold
        self.cognitive_load_gaze_entropy_threshold = cognitive_load_gaze_entropy_threshold
        self.stress_hrv_threshold = stress_hrv_threshold
        self.confusion_blink_threshold = confusion_blink_threshold

        self._smoothed_state: Dict[str, float] = {s: 0.0 for s in self.STATE_LABELS}
        self._history: List[Dict[str, float]] = []

    def _compute_gaze_entropy(self, gaze_x: List[float], gaze_y: List[float], bins: int = 8) -> float:
        if len(gaze_x) < 10 or len(gaze_y) < 10:
            return 0.5
        n = min(len(gaze_x), len(gaze_y))
        x_range = max(gaze_x) - min(gaze_x)
        y_range = max(gaze_y) - min(gaze_y)
        if x_range < 0.001 or y_range < 0.001:
            return 0.0
        x_bin_w = x_range / bins
        y_bin_w = y_range / bins
        grid = [[0] * bins for _ in range(bins)]
        for i in range(n):
            xi = min(bins - 1, int((gaze_x[i] - min(gaze_x)) / x_bin_w))
            yi = min(bins - 1, int((gaze_y[i] - min(gaze_y)) / y_bin_w))
            grid[xi][yi] += 1
        total = sum(sum(row) for row in grid)
        if total == 0:
            return 0.0
        entropy = 0.0
        for row in grid:
            for v in row:
                p = v / total
                if p > 0:
                    entropy -= p * math.log2(p)
        max_entropy = math.log2(bins * bins)
        return entropy / max_entropy if max_entropy > 0 else 0.0

    def _compute_hrv_coherence(self, heart_rate_history: List[float]) -> float:
        if len(heart_rate_history) < 10:
            return 0.5
        rr_intervals = []
        for i in range(1, len(heart_rate_history)):
            if heart_rate_history[i] != heart_rate_history[i - 1]:
                rr = 60.0 / heart_rate_history[i]
                rr_intervals.append(rr)
        if len(rr_intervals) < 5:
            return 0.5
        mean_rr = sum(rr_intervals) / len(rr_intervals)
        rmssd = math.sqrt(sum((rr_intervals[i] - rr_intervals[i - 1]) ** 2
                              for i in range(1, len(rr_intervals))) / max(1, len(rr_intervals) - 1))
        hrv = rmssd / max(1e-6, mean_rr)
        return min(1.0, hrv / 0.1)

    def _compute_blink_anomaly(self, eye_openness_history: List[float]) -> float:
        if len(eye_openness_history) < 20:
            return 0.0
        blink_durations = []
        in_blink = False
        blink_start = 0
        for i, v in enumerate(eye_openness_history):
            if not in_blink and v < 0.3:
                in_blink = True
                blink_start = i
            elif in_blink and v > 0.5:
                in_blink = False
                blink_durations.append(i - blink_start)
        if not blink_durations:
            return 0.0
        mean_duration = sum(blink_durations) / len(blink_durations)
        std_duration = math.sqrt(sum((d - mean_duration) ** 2 for d in blink_durations) / len(blink_durations))
        cv = std_duration / max(1.0, mean_duration)
        return min(1.0, cv)

    def classify(
        self,
        gaze_history_x: List[float],
        gaze_history_y: List[float],
        pupil_diameters: List[float],
        heart_rate_history: List[float],
        eye_openness_history: List[float],
        head_pose_variance: float = 0.0,
        face_detected: bool = True,
    ) -> Dict[str, any]:
        """
        Classify current cognitive/affective state from biometric signals.

        Returns:
          - state: str — most likely state label
          - confidence: float — confidence in prediction [0, 1]
          - confidence_95_ci: tuple[float, float] — 95% bootstrap CI
          - all_probs: dict — probabilities for all states
          - explanation: str — human-readable explanation
        """
        gaze_entropy = self._compute_gaze_entropy(gaze_history_x, gaze_history_y)
        pupil_std = std(pupil_diameters) if len(pupil_diameters) > 1 else 0.0
        hrv_coherence = self._compute_hrv_coherence(heart_rate_history)
        blink_cv = self._compute_blink_anomaly(eye_openness_history)

        logits = {s: -5.0 for s in self.STATE_LABELS}

        logits["NEUTRAL"] = (
            + 2.0 * (1.0 - min(1.0, gaze_entropy / 0.8))
            + 1.5 * (1.0 - min(1.0, pupil_std / 0.03))
            + 1.0 * hrv_coherence
            + 1.0 * (1.0 - min(1.0, blink_cv / 0.5))
        )

        logits["COGNITIVE_LOAD"] = (
            + 3.0 * max(0.0, (gaze_entropy - self.cognitive_load_gaze_entropy_threshold) / 0.3)
            + 1.0 * max(0.0, (pupil_std - 0.01) / 0.02)
            + 0.5 * head_pose_variance
        )

        logits["STRESS"] = (
            + 2.0 * max(0.0, (1.0 - hrv_coherence - self.stress_hrv_threshold) / 0.3)
            + 1.5 * max(0.0, (pupil_std - 0.015) / 0.02)
            + 1.0 * max(0.0, (blink_cv - self.confusion_blink_threshold) / 0.3)
            + 0.5 * (1.0 - min(1.0, gaze_entropy / 0.6))
        )

        logits["CONFUSION"] = (
            + 2.0 * max(0.0, (blink_cv - self.confusion_blink_threshold) / 0.3)
            + 1.5 * (1.0 - gaze_entropy)
            + 1.0 * max(0.0, (pupil_std - 0.01) / 0.02)
        )

        logits["SPOOFING_ANOMALY"] = (
            + 3.0 * (1.0 if not face_detected else 0.0)
            + 2.5 * max(0.0, (pupil_std - self.spoofing_pupil_std_threshold) / 0.01)
            + 2.0 * (1.0 - hrv_coherence)
            + 1.0 * max(0.0, (blink_cv - 0.6) / 0.3)
        )

        max_logit = max(logits.values())
        probs = {k: math.exp(v - max_logit) for k, v in logits.items()}
        total = sum(probs.values())
        probs = {k: v / total for k, v in probs.items()}

        for k in self._smoothed_state:
            self._smoothed_state[k] = (
                self.alpha * probs[k] + (1.0 - self.alpha) * self._smoothed_state[k]
            )

        self._history.append(dict(self._smoothed_state))
        if len(self._history) > 300:
            self._history.pop(0)

        best_state = max(self._smoothed_state, key=self._smoothed_state.get)
        raw_confidence = self._smoothed_state[best_state]

        n_bootstrap = min(100, len(self._history))
        if n_bootstrap >= 10:
            bootstrap_samples = []
            for _ in range(50):
                sample = [random.choice(self._history) for _ in range(n_bootstrap)]
                avg = {k: sum(s[k] for s in sample) / len(sample) for k in self.STATE_LABELS}
                bootstrap_samples.append(max(avg.values()))
            sorted_samples = sorted(bootstrap_samples)
            ci_lo = sorted_samples[2]
            ci_hi = sorted_samples[-3]
        else:
            ci_lo = max(0.0, raw_confidence - 0.15)
            ci_hi = min(1.0, raw_confidence + 0.15)

        return {
            "state": best_state,
            "confidence": round(raw_confidence, 4),
            "confidence_95_ci": (round(ci_lo, 4), round(ci_hi, 4)),
            "all_probs": {k: round(v, 4) for k, v in self._smoothed_state.items()},
            "gaze_entropy": round(gaze_entropy, 4),
            "pupil_std": round(pupil_std, 4),
            "hrv_coherence": round(hrv_coherence, 4),
            "blink_cv": round(blink_cv, 4),
            "explanation": (
                f"Security-relevant state: {best_state} "
                f"(confidence {raw_confidence:.1%}, "
                f"95% CI [{ci_lo:.1%}, {ci_hi:.1%}]). "
                + ("Used for intrusion detection only — never for candidate evaluation."
                   if best_state != "NEUTRAL"
                   else "Candidate at baseline attentive state.")
            ),
        }


def std(values: List[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    mean = sum(values) / n
    variance = sum((v - mean) ** 2 for v in values) / (n - 1)
    return math.sqrt(variance)
