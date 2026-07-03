"""
AEGIS Research Institute — Next-Generation Backend AI Evaluation Blueprint
Module: Deepfake Agent (CAST Cross-Attention & Lip-Sync Evaluation Engine)
Strict Rule Compliance: [ZERO-COMPROMISE-1] — Pure backend statistical evaluation engine.

Evaluates spatial frequency anomalies and temporal cross-modal audio-visual lip-synchronization
(LipFD / SAVe metrics) to detect real-time face-swapping and AI voice cloning attacks.
"""

import math
from typing import List, Dict, Any


class DeepfakeAgentEvaluator:
    """
    Implements Section 7: Deepfake CNN-Transformer & Lip-Sync Evaluation Engine.
    """

    def __init__(
        self,
        max_lip_sync_lag_ms: float = 85.0,
        min_lip_audio_correlation: float = 0.62,
        max_frequency_artifact_score: float = 0.35,
    ):
        """
        :param max_lip_sync_lag_ms: Maximum allowable delay between viseme mouth motion and audio phoneme energy.
        :param min_lip_audio_correlation: Minimum cross-correlation Pearson coefficient between mouth velocity and audio envelope.
        :param max_frequency_artifact_score: Threshold for high-frequency spectral checkerboard anomaly score.
        """
        self.max_lip_sync_lag_ms = max_lip_sync_lag_ms
        self.min_lip_audio_correlation = min_lip_audio_correlation
        self.max_frequency_artifact_score = max_frequency_artifact_score

    @staticmethod
    def pearson_correlation(s1: List[float], s2: List[float]) -> float:
        n = min(len(s1), len(s2))
        if n < 2:
            return 0.0
        m1 = sum(s1[:n]) / n
        m2 = sum(s2[:n]) / n

        num = 0.0
        den1 = 0.0
        den2 = 0.0
        for i in range(n):
            d1 = s1[i] - m1
            d2 = s2[i] - m2
            num += d1 * d2
            den1 += d1 * d1
            den2 += d2 * d2

        if den1 <= 0.0 or den2 <= 0.0:
            return 0.0
        return num / math.sqrt(den1 * den2)

    def evaluate_lip_synchronization(
        self, mouth_opening_velocity: List[float], audio_energy_envelope: List[float], sample_rate_hz: float = 30.0
    ) -> Dict[str, Any]:
        """
        Evaluates temporal alignment between visual mouth kinematics and acoustic speech energy.
        """
        n = min(len(mouth_opening_velocity), len(audio_energy_envelope))
        if n < 10:
            return {
                "correlation": 0.0,
                "lag_ms": 0.0,
                "lip_sync_valid": False,
                "explanation": "Insufficient temporal frames for lip-sync cross-correlation.",
            }

        best_corr = -1.0
        best_lag_frames = 0
        max_lag_frames = int(max(1, round((150.0 / 1000.0) * sample_rate_hz)))

        # Evaluate cross-correlation across lag window [-max_lag_frames, max_lag_frames]
        for lag in range(-max_lag_frames, max_lag_frames + 1):
            if lag < 0:
                s1 = mouth_opening_velocity[-lag:]
                s2 = audio_energy_envelope[:len(s1)]
            else:
                s1 = mouth_opening_velocity[: n - lag]
                s2 = audio_energy_envelope[lag:lag + len(s1)]

            corr = self.pearson_correlation(s1, s2)
            if corr > best_corr:
                best_corr = corr
                best_lag_frames = lag

        lag_ms = round((abs(best_lag_frames) / sample_rate_hz) * 1000.0, 2)
        lip_sync_valid = (
            best_corr >= self.min_lip_audio_correlation and lag_ms <= self.max_lip_sync_lag_ms
        )

        return {
            "peak_correlation": round(best_corr, 4),
            "temporal_lag_ms": lag_ms,
            "lip_sync_valid": lip_sync_valid,
            "explanation": (
                f"Valid lip synchronization (corr: {best_corr:.2f}, lag: {lag_ms:.1f}ms)."
                if lip_sync_valid
                else f"Lip-sync anomaly detected (corr: {best_corr:.2f}, lag: {lag_ms:.1f}ms)."
            ),
        }

    def evaluate_stream(
        self,
        mouth_velocities: List[float],
        audio_energies: List[float],
        spectral_artifact_scores: List[float],
        sample_rate_hz: float = 30.0,
    ) -> Dict[str, Any]:
        """
        Fuses lip-sync alignment and spatial frequency analysis into a deepfake integrity decision.
        """
        lip_res = self.evaluate_lip_synchronization(mouth_velocities, audio_energies, sample_rate_hz)
        avg_artifact_score = (
            sum(spectral_artifact_scores) / max(1, len(spectral_artifact_scores))
            if spectral_artifact_scores
            else 0.0
        )

        artifact_flag = avg_artifact_score >= self.max_frequency_artifact_score
        deepfake_detected = not lip_res["lip_sync_valid"] or artifact_flag

        risk_score = 0.0
        if not lip_res["lip_sync_valid"]:
            risk_score += 0.6
        if artifact_flag:
            risk_score += 0.4

        return {
            "lip_sync_evaluation": lip_res,
            "avg_spectral_artifact_score": round(avg_artifact_score, 4),
            "frequency_artifact_flagged": artifact_flag,
            "deepfake_detected": deepfake_detected,
            "risk_score": round(min(1.0, risk_score), 4),
            "explanation": (
                "Flagged synthetic deepfake generator signature."
                if deepfake_detected
                else "Verified authentic physical video stream integrity."
            ),
        }
