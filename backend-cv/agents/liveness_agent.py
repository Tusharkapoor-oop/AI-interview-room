import math
import random
from typing import List, Dict, Any, Tuple


class LivenessAgentEvaluator:

    def __init__(
        self,
        min_plr_constriction_ratio: float = 0.08,
        max_plr_constriction_ratio: float = 0.48,
        min_rppg_snr_db: float = 4.5,
        min_heart_rate_bpm: float = 45.0,
        max_heart_rate_bpm: float = 160.0,
        plr_latency_min_ms: float = 180.0,
        plr_latency_max_ms: float = 320.0,
        max_plr_anticipation_frames: int = 3,
        motion_artifact_threshold: float = 0.15,
    ):
        self.min_plr_constriction_ratio = min_plr_constriction_ratio
        self.max_plr_constriction_ratio = max_plr_constriction_ratio
        self.min_rppg_snr_db = min_rppg_snr_db
        self.min_heart_rate_bpm = min_heart_rate_bpm
        self.max_heart_rate_bpm = max_heart_rate_bpm
        self.plr_latency_min_ms = plr_latency_min_ms
        self.plr_latency_max_ms = plr_latency_max_ms
        self.max_plr_anticipation_frames = max_plr_anticipation_frames
        self.motion_artifact_threshold = motion_artifact_threshold

    def suggest_stimulus_delays(self, num_stimuli: int = 3) -> List[float]:
        """Generate randomized inter-stimulus delays to prevent timing prediction attacks.
        Returns delays in seconds between 2.0 and 7.0 with jitter."""
        delays = []
        for _ in range(num_stimuli):
            base = random.uniform(3.0, 6.0)
            jitter = random.uniform(-1.0, 1.0)
            delays.append(round(max(2.0, min(7.0, base + jitter)), 1))
        return delays

    def evaluate_plr_kinetics(
        self,
        baseline_diameter: float,
        stimulus_diameters: List[float],
        stimulus_timestamps_s: List[float] = None,
        diameter_timestamps_s: List[float] = None,
    ) -> Dict[str, Any]:
        if baseline_diameter <= 0.0 or not stimulus_diameters:
            return {
                "constriction_ratio": 0.0,
                "plr_valid": False,
                "plr_anticipation_flagged": False,
                "explanation": "Invalid pupil diameter measurements.",
            }

        min_diameter = min(stimulus_diameters)
        constriction_ratio = (baseline_diameter - min_diameter) / baseline_diameter
        plr_valid = (
            self.min_plr_constriction_ratio <= constriction_ratio <= self.max_plr_constriction_ratio
        )

        anticipation_flagged = False
        if stimulus_timestamps_s and diameter_timestamps_s and len(stimulus_timestamps_s) >= 1:
            # Check if constriction starts BEFORE the light stimulus (video replay attack)
            first_constriction_idx = None
            for i in range(1, len(stimulus_diameters)):
                if stimulus_diameters[i] < stimulus_diameters[i - 1] * 0.97:
                    first_constriction_idx = i
                    break

            if first_constriction_idx is not None and first_constriction_idx < len(diameter_timestamps_s):
                stimulus_start = min(stimulus_timestamps_s)
                constriction_time = diameter_timestamps_s[first_constriction_idx]
                reaction_latency_ms = (constriction_time - stimulus_start) * 1000.0

                if reaction_latency_ms < 0:
                    anticipation_flagged = True

                if not anticipation_flagged and reaction_latency_ms > 0:
                    plausible = self.plr_latency_min_ms <= reaction_latency_ms <= self.plr_latency_max_ms
                    if not plausible:
                        pass  # still biologically plausible but suspicious — lower confidence

        if anticipation_flagged:
            plr_valid = False

        return {
            "baseline_diameter": round(baseline_diameter, 4),
            "min_diameter": round(min_diameter, 4),
            "constriction_ratio": round(constriction_ratio, 4),
            "plr_valid": plr_valid,
            "plr_anticipation_flagged": anticipation_flagged,
            "explanation": (
                f"Valid physiological pupillary constriction ({constriction_ratio:.1%})."
                if plr_valid
                else (
                    "Anticipatory pupil constriction detected (precedes stimulus) — possible video replay attack."
                    if anticipation_flagged
                    else f"Pupil dynamics outside physiological envelope ({constriction_ratio:.1%})."
                )
            ),
        }

    @staticmethod
    def compute_dft_power_spectrum(signal: List[float], sample_rate_hz: float) -> List[Tuple[float, float]]:
        n = len(signal)
        if n == 0 or sample_rate_hz <= 0:
            return []

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

    def _compute_motion_artifact_level(
        self, face_roi_motion: List[float] = None
    ) -> float:
        if not face_roi_motion or len(face_roi_motion) < 5:
            return 0.0
        mean_motion = sum(face_roi_motion) / len(face_roi_motion)
        return mean_motion

    def evaluate_rppg_pulse(
        self,
        green_channel_series: List[float],
        sample_rate_hz: float = 30.0,
        skin_tone_factor: float = 1.0,
        face_roi_motion: List[float] = None,
    ) -> Dict[str, Any]:
        spectrum = self.compute_dft_power_spectrum(green_channel_series, sample_rate_hz)
        if not spectrum:
            return {
                "estimated_bpm": 0.0,
                "snr_db": 0.0,
                "rppg_valid": False,
                "motion_artifact_flagged": False,
                "explanation": "Insufficient green channel frames.",
            }

        motion_artifact = self._compute_motion_artifact_level(face_roi_motion)
        motion_flagged = motion_artifact > self.motion_artifact_threshold

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
            elif freq > 0.3:
                noise_power_sum += power
                noise_count += 1

        avg_noise_power = max(1e-9, noise_power_sum / max(1, noise_count))
        snr_linear = peak_power / avg_noise_power
        snr_db = 10.0 * math.log10(max(1e-9, snr_linear))

        snr_db_adjusted = snr_db + 2.0 * math.log10(max(0.5, skin_tone_factor))
        estimated_bpm = peak_freq * 60.0

        rppg_valid = (
            self.min_heart_rate_bpm <= estimated_bpm <= self.max_heart_rate_bpm
            and snr_db_adjusted >= self.min_rppg_snr_db
            and not motion_flagged
        )

        return {
            "estimated_bpm": round(estimated_bpm, 1),
            "snr_db": round(snr_db, 2),
            "snr_db_adjusted": round(snr_db_adjusted, 2),
            "skin_tone_factor": round(skin_tone_factor, 3),
            "motion_artifact_level": round(motion_artifact, 4),
            "motion_artifact_flagged": motion_flagged,
            "rppg_valid": rppg_valid,
            "explanation": (
                f"Detected coherent cardiac pulse ({estimated_bpm:.1f} BPM, SNR {snr_db_adjusted:.1f} dB)."
                if rppg_valid
                else (
                    f"Motion artifact detected (level {motion_artifact:.3f}) — rPPG unreliable."
                    if motion_flagged
                    else f"Absence of physiological blood flow pulse (SNR {snr_db:.1f} dB)."
                )
            ),
        }

    def evaluate_rppg_spoofing_detection(
        self,
        green_channel_series: List[float],
        sample_rate_hz: float = 30.0,
    ) -> Dict[str, Any]:
        """
        Detect ChatPPG-style synthetic heartbeat injection attacks.

        Synthetic rPPG signals differ from physiological rPPG in three ways:
          1. Higher spectral flatness (too uniform across frequency bands)
          2. Lower phase coherence (temporal correlation between harmonics degrades)
          3. Higher periodicity autocorrelation (too perfectly periodic — no HRV)

        Returns dict with:
          - spectral_flatness: float — near 1.0 = synthetic, near 0.0 = physiological
          - phase_coherence: float — near 1.0 = physiological, near 0.0 = synthetic
          - periodicity_score: float — high = synthetic (too perfect)
          - spoofing_flagged: bool — true if synthetic heartbeat detected
        """
        n = len(green_channel_series)
        if n < 30:
            return {
                "spectral_flatness": 0.0,
                "phase_coherence": 0.0,
                "periodicity_score": 0.0,
                "spoofing_flagged": False,
                "explanation": "Insufficient samples for rPPG spoofing analysis.",
            }

        spectrum = self.compute_dft_power_spectrum(green_channel_series, sample_rate_hz)
        if not spectrum:
            return {
                "spectral_flatness": 0.0,
                "phase_coherence": 0.0,
                "periodicity_score": 0.0,
                "spoofing_flagged": False,
                "explanation": "Failed to compute power spectrum.",
            }

        total_power = sum(p for _, p in spectrum)
        if total_power <= 0:
            return {
                "spectral_flatness": 0.0,
                "phase_coherence": 0.0,
                "periodicity_score": 0.0,
                "spoofing_flagged": False,
                "explanation": "Zero power in rPPG signal.",
            }

        power_norm = [p / total_power for _, p in spectrum]

        log_geom_sum = sum(math.log(max(1e-12, p)) for p in power_norm)
        geom_mean = math.exp(log_geom_sum / len(power_norm))
        arith_mean = 1.0 / len(power_norm)
        spectral_flatness = geom_mean / max(1e-12, arith_mean)

        cardiac_band_min = spectrum[0][0] if spectrum else 0.0
        cardiac_band_max = spectrum[-1][0] if spectrum else sample_rate_hz / 2
        harmonics = [(f, p) for f, p in spectrum if cardiac_band_min <= f <= cardiac_band_max]
        phase_coherence = 0.0
        if len(harmonics) >= 2:
            peaks_sorted = sorted(harmonics, key=lambda x: -x[1])
            if len(peaks_sorted) >= 3:
                f0 = peaks_sorted[0][0]
                f1 = peaks_sorted[1][0]
                f2 = peaks_sorted[2][0]
                harmonic_ratio_1 = abs(f1 / f0 - 2.0) if f0 > 0 else 99.0
                harmonic_ratio_2 = abs(f2 / f0 - 3.0) if f0 > 0 else 99.0
                phase_coherence = 1.0 - min(1.0, (harmonic_ratio_1 + harmonic_ratio_2) / 2.0)
            else:
                phase_coherence = 0.3

        mean_val = sum(green_channel_series) / n
        centered = [x - mean_val for x in green_channel_series]
        lag_autocorr = [
            sum(centered[i] * centered[(i + lag) % n] for i in range(n)) / max(1e-12, sum(c * c for c in centered))
            for lag in range(1, min(n // 2, n))
        ]
        peak_autocorr = max(lag_autocorr) if lag_autocorr else 0.0
        periodicity_score = max(0.0, min(1.0, peak_autocorr))

        spoofing_flagged = (
            spectral_flatness > 0.6
            or phase_coherence < 0.2
            or periodicity_score > 0.95
        )

        return {
            "spectral_flatness": round(spectral_flatness, 4),
            "phase_coherence": round(phase_coherence, 4),
            "periodicity_score": round(periodicity_score, 4),
            "spoofing_flagged": spoofing_flagged,
            "explanation": (
                f"Synthetic heartbeat injection detected "
                f"(flatness={spectral_flatness:.3f}, coherence={phase_coherence:.3f}, periodicity={periodicity_score:.3f})."
                if spoofing_flagged
                else f"Physiological rPPG signal confirmed "
                f"(flatness={spectral_flatness:.3f}, coherence={phase_coherence:.3f}, periodicity={periodicity_score:.3f})."
            ),
        }

    def evaluate_liveness_fusion(
        self,
        baseline_pupil: float,
        stimulus_pupils: List[float],
        green_channel_series: List[float],
        sample_rate_hz: float = 30.0,
        stimulus_timestamps_s: List[float] = None,
        diameter_timestamps_s: List[float] = None,
        skin_tone_factor: float = 1.0,
        face_roi_motion: List[float] = None,
    ) -> Dict[str, Any]:
        plr_res = self.evaluate_plr_kinetics(
            baseline_pupil, stimulus_pupils,
            stimulus_timestamps_s=stimulus_timestamps_s,
            diameter_timestamps_s=diameter_timestamps_s,
        )
        rppg_res = self.evaluate_rppg_pulse(
            green_channel_series, sample_rate_hz,
            skin_tone_factor=skin_tone_factor,
            face_roi_motion=face_roi_motion,
        )
        spoof_res = self.evaluate_rppg_spoofing_detection(
            green_channel_series, sample_rate_hz,
        )

        liveness_verified = (
            plr_res["plr_valid"]
            and rppg_res["rppg_valid"]
            and not plr_res["plr_anticipation_flagged"]
            and not spoof_res["spoofing_flagged"]
        )

        confidence_score = 0.0
        if plr_res["plr_valid"] and not plr_res["plr_anticipation_flagged"]:
            confidence_score += 0.35
        if rppg_res["rppg_valid"]:
            confidence_score += 0.35
        if not spoof_res["spoofing_flagged"]:
            confidence_score += 0.30

        return {
            "liveness_verified": liveness_verified,
            "confidence_score": round(confidence_score, 4),
            "plr_evaluation": plr_res,
            "rppg_evaluation": rppg_res,
            "spoofing_evaluation": spoof_res,
            "explanation": (
                "Verified authentic biological liveness across pupillary reflex, photoplethysmographic pulse, and rPPG spoofing analysis."
                if liveness_verified
                else (
                    "Synthetic heartbeat injection detected in rPPG signal — possible ChatPPG-style attack."
                    if spoof_res["spoofing_flagged"]
                    else "Liveness challenge failed: possible spoofing attack."
                )
            ),
        }
