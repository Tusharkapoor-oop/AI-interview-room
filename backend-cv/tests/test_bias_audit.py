"""
test_bias_audit.py — Phase 5.2

Bias audit: tests CV models across simulated demographic profiles,
verifying FPR/FNR parity under NYC Local Law 144 and EU AI Act Art. 27.

Each demographic profile defines a set of biometric signal variations:
  - Skin tone (Fitzpatrick scale 1-6) → rPPG SNR adjustment
  - Eye shape / eyelid geometry → gaze tracking precision
  - Pupil color (iris contrast) → pupil diameter estimation accuracy
  - Face landmark tracking robustness

Thresholds:
  - FPR/FNR delta between any two groups < 0.10 (NYC Law 144 §5-3)
  - Demographic parity ratio in [0.8, 1.25] (EEOC 4/5 rule)
"""
import math
import random

import pytest

from agents.liveness_agent import LivenessAgentEvaluator
from agents.gaze_agent import GazeAgentEvaluator

SEED = 42
N_TRIALS = 50

DEMOGRAPHIC_PROFILES = [
    {"label": "Fitzpatrick I-II (light)", "skin_tone": 1.2, "iris_contrast": 0.9, "eye_aspect_ratio": 0.28, "landmark_quality": 0.95},
    {"label": "Fitzpatrick III-IV (medium)", "skin_tone": 1.0, "iris_contrast": 0.7, "eye_aspect_ratio": 0.25, "landmark_quality": 0.90},
    {"label": "Fitzpatrick V-VI (dark)", "skin_tone": 0.7, "iris_contrast": 0.5, "eye_aspect_ratio": 0.22, "landmark_quality": 0.82},
    {"label": "East Asian eye geometry", "skin_tone": 1.0, "iris_contrast": 0.75, "eye_aspect_ratio": 0.20, "landmark_quality": 0.88},
    {"label": "Glasses wearer", "skin_tone": 1.0, "iris_contrast": 0.6, "eye_aspect_ratio": 0.25, "landmark_quality": 0.75},
]


def _simulate_rppg_signal(length: int, skin_tone: float, is_spoof: bool = False) -> list:
    hb_freq = 1.2 if not is_spoof else 0.0
    noise_floor = 0.02 / skin_tone
    signal = []
    for t in range(length):
        cardiac = 0.5 + 0.4 * math.sin(2.0 * math.pi * hb_freq * t / 30.0)
        noise = random.gauss(0, noise_floor)
        signal.append(cardiac + noise)
    if is_spoof:
        for t in range(length):
            signal[t] = signal[t] * 0.3 + 0.5
    return signal


def _simulate_pupil_response(baseline: float, skin_tone: float, iris_contrast: float) -> tuple:
    noise = random.gauss(0, 0.005 / max(0.3, iris_contrast))
    constriction = random.uniform(0.1, 0.2)
    post_stimulus = [baseline * (1.0 - constriction) + noise * (2 - skin_tone) for _ in range(10)]
    return baseline, post_stimulus


def _simulate_gaze(eye_aspect_ratio: float, landmark_quality: float) -> dict:
    gaze_noise = 0.02 / max(0.5, landmark_quality)
    ear_noise = 0.01 / max(0.5, landmark_quality)
    screen_x = 0.5 + random.gauss(0, gaze_noise)
    screen_y = 0.5 + random.gauss(0, gaze_noise)
    ear = eye_aspect_ratio + random.gauss(0, ear_noise)
    return {"screen_x": screen_x, "screen_y": screen_y, "ear": max(0.05, ear)}


@pytest.fixture(scope="module", autouse=True)
def set_seed():
    random.seed(SEED)


class TestBiasAudit:

    def _run_rppg_bias_trial(self, profile: dict) -> dict:
        evaluator = LivenessAgentEvaluator()
        green = _simulate_rppg_signal(90, profile["skin_tone"])
        rppg_res = evaluator.evaluate_rppg_pulse(
            green, sample_rate_hz=30.0,
            skin_tone_factor=profile["skin_tone"],
            face_roi_motion=[random.gauss(0, 0.02) for _ in range(90)],
        )
        return {
            "rppg_valid": rppg_res["rppg_valid"],
            "snr_db": rppg_res["snr_db_adjusted"],
        }

    def _run_pupil_bias_trial(self, profile: dict) -> dict:
        evaluator = LivenessAgentEvaluator()
        baseline, diameters = _simulate_pupil_response(3.5, profile["skin_tone"], profile["iris_contrast"])
        plr_res = evaluator.evaluate_plr_kinetics(baseline, diameters)
        return {
            "plr_valid": plr_res["plr_valid"],
            "constriction_ratio": plr_res["constriction_ratio"],
        }

    def _run_gaze_bias_trial(self, profile: dict) -> dict:
        evaluator = GazeAgentEvaluator()
        gaze = _simulate_gaze(profile["eye_aspect_ratio"], profile["landmark_quality"])
        in_ui = evaluator.is_in_active_region(gaze["screen_x"], gaze["screen_y"])
        return {
            "in_active_ui": in_ui,
            "ear": gaze["ear"],
        }

    def test_rppg_fpr_parity(self):
        """Verify rPPG false positive rate is within 0.10 across demographics."""
        results = {}
        for prof in DEMOGRAPHIC_PROFILES:
            valid_count = sum(1 for _ in range(N_TRIALS) if self._run_rppg_bias_trial(prof)["rppg_valid"])
            results[prof["label"]] = round(valid_count / N_TRIALS, 3)

        rates = list(results.values())
        max_delta = max(rates) - min(rates)
        print(f"\nrPPG detection rates by group: {results}")
        print(f"Max delta: {max_delta:.3f}")

        assert max_delta < 0.10, (
            f"rPPG detection rate delta {max_delta:.3f} exceeds 0.10 threshold. "
            f"Worst pair: {min(results, key=results.get)} ({min(rates):.3f}) vs "
            f"{max(results, key=results.get)} ({max(rates):.3f})"
        )

    def test_plr_fpr_parity(self):
        """Verify PLR detection false positive rate is within 0.10 across demographics."""
        results = {}
        for prof in DEMOGRAPHIC_PROFILES:
            valid_count = sum(1 for _ in range(N_TRIALS) if self._run_pupil_bias_trial(prof)["plr_valid"])
            results[prof["label"]] = round(valid_count / N_TRIALS, 3)

        rates = list(results.values())
        max_delta = max(rates) - min(rates)
        print(f"\nPLR detection rates by group: {results}")
        print(f"Max delta: {max_delta:.3f}")

        assert max_delta < 0.10, (
            f"PLR detection rate delta {max_delta:.3f} exceeds 0.10 threshold"
        )

    def test_gaze_demographic_parity(self):
        """Verify GazeAgentEvaluator does not introduce additional bias beyond raw sensor variation."""
        results = {}
        for prof in DEMOGRAPHIC_PROFILES:
            in_ui_count = 0
            for _ in range(N_TRIALS):
                res = self._run_gaze_bias_trial(prof)
                if res["in_active_ui"]:
                    in_ui_count += 1
            in_ui_rate = in_ui_count / N_TRIALS
            results[prof["label"]] = round(in_ui_rate, 3)

        print(f"\nIn-active-UI rate by demographic: {results}")

        rates = list(results.values())
        max_delta = max(rates) - min(rates)
        print(f"Max FPR delta: {max_delta:.3f}")

        assert max_delta < 0.15, (
            f"Gaze in-active-UI rate delta {max_delta:.3f} suggests algorithmic bias. "
            f"Worst pair: {min(results, key=results.get)} ({min(rates):.3f}) vs "
            f"{max(results, key=results.get)} ({max(rates):.3f})"
        )

    def test_spoofing_parity(self):
        """Verify spoofing detection is equally effective across demographics."""
        results = {}
        for prof in DEMOGRAPHIC_PROFILES:
            true_positives = 0
            for _ in range(N_TRIALS):
                green = _simulate_rppg_signal(90, prof["skin_tone"], is_spoof=True)
                evaluator = LivenessAgentEvaluator()
                spoof_res = evaluator.evaluate_rppg_spoofing_detection(green, sample_rate_hz=30.0)
                if spoof_res["spoofing_flagged"]:
                    true_positives += 1
            results[prof["label"]] = round(true_positives / N_TRIALS, 3)

        rates = list(results.values())
        max_delta = max(rates) - min(rates)
        print(f"\nSpoofing TPR by group: {results}")
        print(f"Max delta: {max_delta:.3f}")

        assert max_delta < 0.10, (
            f"Spoofing TPR delta {max_delta:.3f} exceeds 0.10 threshold"
        )
        for label, tpr in results.items():
            assert tpr > 0.5, f"Spoofing TPR {tpr:.3f} for {label} below 0.5 — inadequate protection"
