"""
AEGIS Research Institute — Next-Generation Backend AI Evaluation Blueprint
Module: Liveness Agent (Combined PLR + rPPG Biological Verification Engine)
Strict Rule Compliance: [ZERO-COMPROMISE-1] — Pure backend statistical evaluation engine.

Evaluates Pupillary Light Reflex (PLR) constriction kinetics synchronized with
green-channel remote photoplethysmography (rPPG) cardiac waveforms to thwart photo,
video replay, and 3D mask presentation attacks.
"""

import math
from typing import List, Dict, Any, Tuple


class LivenessAgentEvaluator:
    """
    Implements Section 11.3: Combined PLR + rPPG Single-Check Liveness Engine.
    """

    def __init__(
        self,
        min_plr_constriction_ratio: float = 0.08,
        max_plr_constriction_ratio: float = 0.48,
        min_rppg_snr_db: float = 4.5,
        min_heart_rate_bpm: float = 45.0,
        max_heart_rate_bpm: float = 160.0,
    ):
        """
        :param min_plr_constriction_ratio: Minimum legitimate (D0 - Dmin) / D0 pupil constriction ratio.
        :param max_plr_constriction_ratio: Maximum physiological constriction ratio.
        :param min_rppg_snr_db: Minimum required Signal-to-Noise Ratio (SNR) in cardiac band (0.8 - 2.5 Hz).
        :param min_heart_rate_bpm: Minimum physiological human resting pulse.
        :param max_heart_rate_bpm: Maximum physiological human pulse under stress.
        """
        self.min_plr_constriction_ratio = min_plr_constriction_ratio
        self.max_plr_constriction_ratio = max_plr_constriction_ratio
        self.min_rppg_snr_db = min_rppg_snr_db
        self.min_heart_rate_bpm = min_heart_rate_bpm
        self.max_heart_rate_bpm = max_heart_rate_bpm

    def evaluate_plr_kinetics(self, baseline_diameter: float, stimulus_diameters: List[float]) -> Dict[str, Any]:
        """
        Evaluates pupillary constriction kinetics during a controlled lighting challenge.
        """
        if baseline_diameter <= 0.0 or not stimulus_diameters:
            return {
                "constriction_ratio": 0.0,
                "plr_valid": False,
                "explanation": "Invalid pupil diameter measurements.",
            }

        min_diameter = min(stimulus_diameters)
        constriction_ratio = (baseline_diameter - min_diameter) / baseline_diameter
        plr_valid = (
            self.min_plr_constriction_ratio <= constriction_ratio <= self.max_plr_constriction_ratio
        )

        return {
            "baseline_diameter": round(baseline_diameter, 4),
            "min_diameter": round(min_diameter, 4),
            "constriction_ratio": round(constriction_ratio, 4),
            "plr_valid": plr_valid,
            "explanation": (
                f"Valid physiological pupillary constriction ({constriction_ratio:.1%})."
                if plr_valid
                else f"Pupil dynamics outside physiological envelope ({constriction_ratio:.1%})."
            ),
        }

    @staticmethod
    def compute_dft_power_spectrum(signal: List[float], sample_rate_hz: float) -> List[Tuple[float, float]]:
        """
        Computes exact Discrete Fourier Transform (DFT) power spectrum over the signal.
        Returns list of (frequency_hz, power) tuples.
        """
        n = len(signal)
        if n == 0 or sample_rate_hz <= 0:
            return []

        # Remove mean (DC component)
        mean_val = sum(signal) / n
        centered = [x - mean_val for x in signal]

        spectrum = []
        for k in range(n // 2):
            freq = k * sample_rate_hz / n
            re = 0.0
            im = 0.0
            for t in range(n):
                angle = 2.0 * math.pi * k * t / n
                re += centered[t] * math.cos(angle)
                im -= centered[t] * math.sin(angle)
            power = (re * re + im * im) / n
            spectrum.append((freq, power))
        return spectrum

    def evaluate_rppg_pulse(self, green_channel_series: List[float], sample_rate_hz: float = 30.0) -> Dict[str, Any]:
        """
        Evaluates facial green-channel photoplethysmography waveform for cardiac pulse synchrony.
        """
        spectrum = self.compute_dft_power_spectrum(green_channel_series, sample_rate_hz)
        if not spectrum:
            return {
                "estimated_bpm": 0.0,
                "snr_db": 0.0,
                "rppg_valid": False,
                "explanation": "Insufficient green channel frames.",
            }

        cardiac_band_min_hz = self.min_heart_rate_bpm / 60.0
        cardiac_band_max_hz = self.max_heart_rate_bpm / 60.0

        peak_power = 0.0
        peak_freq = 0.0
        noise_power_sum = 0.0
        noise_count = 0

        for freq, power in spectrum:
            if cardiac_band_min_hz <= freq <= cardiac_band_max_hz:
                if power > peak_power:
                    peak_power = power
                    peak_freq = freq
            elif freq > 0.3:  # exclude ultra-low frequency baseline drift
                noise_power_sum += power
                noise_count += 1

        avg_noise_power = max(1e-9, noise_power_sum / max(1, noise_count))
        snr_linear = peak_power / avg_noise_power
        snr_db = 10.0 * math.log10(max(1e-9, snr_linear))
        estimated_bpm = peak_freq * 60.0

        rppg_valid = (
            self.min_heart_rate_bpm <= estimated_bpm <= self.max_heart_rate_bpm
            and snr_db >= self.min_rppg_snr_db
        )

        return {
            "estimated_bpm": round(estimated_bpm, 1),
            "snr_db": round(snr_db, 2),
            "rppg_valid": rppg_valid,
            "explanation": (
                f"Detected coherent cardiac pulse ({estimated_bpm:.1f} BPM, SNR {snr_db:.1f} dB)."
                if rppg_valid
                else f"Absence of physiological blood flow pulse (SNR {snr_db:.1f} dB)."
            ),
        }

    def evaluate_liveness_fusion(
        self,
        baseline_pupil: float,
        stimulus_pupils: List[float],
        green_channel_series: List[float],
        sample_rate_hz: float = 30.0,
    ) -> Dict[str, Any]:
        """
        Fuses PLR kinetics and rPPG waveform evaluation into a unified liveness decision.
        """
        plr_res = self.evaluate_plr_kinetics(baseline_pupil, stimulus_pupils)
        rppg_res = self.evaluate_rppg_pulse(green_channel_series, sample_rate_hz)

        liveness_verified = plr_res["plr_valid"] and rppg_res["rppg_valid"]
        confidence_score = 0.0
        if plr_res["plr_valid"]:
            confidence_score += 0.5
        if rppg_res["rppg_valid"]:
            confidence_score += 0.5

        return {
            "liveness_verified": liveness_verified,
            "confidence_score": confidence_score,
            "plr_evaluation": plr_res,
            "rppg_evaluation": rppg_res,
            "explanation": (
                "Verified authentic biological liveness across both pupillary reflex and photoplethysmographic pulse."
                if liveness_verified
                else "Liveness challenge failed: possible presentation spoofing attack."
            ),
        }
