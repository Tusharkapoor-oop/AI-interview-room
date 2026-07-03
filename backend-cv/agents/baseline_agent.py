"""
AEGIS Research Institute — Next-Generation Backend AI Evaluation Blueprint
Module: Baseline Agent (Kolmogorov-Smirnov Non-Parametric Distribution Evaluator)
Strict Rule Compliance: [ZERO-COMPROMISE-1] — Pure backend statistical evaluation engine.

Compares enrollment / calibration telemetry distributions against live interview windows
using the two-sample Kolmogorov-Smirnov (KS) test to detect identity substitution or
artificial posture enforcement.
"""

import math
from typing import List, Dict, Any, Tuple


class BaselineAgentEvaluator:
    """
    Implements Section 11.2: KS-Test Statistical Baseline Gaze & Pose Modeling.
    """

    def __init__(self, significance_alpha: float = 0.005, critical_d_threshold: float = 0.35):
        """
        :param significance_alpha: p-value threshold below which distribution shifts are flagged.
        :param critical_d_threshold: KS D-statistic threshold representing maximum tolerable distribution divergence.
        """
        self.significance_alpha = significance_alpha
        self.critical_d_threshold = critical_d_threshold

    @staticmethod
    def compute_ks_2samp(sample1: List[float], sample2: List[float]) -> Tuple[float, float]:
        """
        Computes the two-sample Kolmogorov-Smirnov D-statistic and approximate p-value
        purely algebraically without external heavy dependency bottlenecks.
        """
        n1 = len(sample1)
        n2 = len(sample2)
        if n1 == 0 or n2 == 0:
            return 0.0, 1.0

        s1_sorted = sorted(sample1)
        s2_sorted = sorted(sample2)

        # Merge sorted arrays while tracking empirical CDF differences
        i = 0
        j = 0
        d_max = 0.0

        while i < n1 and j < n2:
            val1 = s1_sorted[i]
            val2 = s2_sorted[j]
            if val1 <= val2:
                i += 1
            if val2 <= val1:
                j += 1
            cdf1 = i / n1
            cdf2 = j / n2
            d = abs(cdf1 - cdf2)
            if d > d_max:
                d_max = d

        # Handle remaining tails
        while i < n1:
            i += 1
            d = abs((i / n1) - 1.0)
            if d > d_max:
                d_max = d
        while j < n2:
            j += 1
            d = abs(1.0 - (j / n2))
            if d > d_max:
                d_max = d

        # Approximate asymptotic p-value using Smirnov's formula
        en = math.sqrt((n1 * n2) / (n1 + n2))
        lmbd = (en + 0.12 + 0.11 / en) * d_max
        if lmbd == 0.0:
            p_val = 1.0
        else:
            # Kolmogorov asymptotic series approximation
            p_val = 0.0
            for k in range(1, 101):
                term = 2.0 * ((-1) ** (k - 1)) * math.exp(-2.0 * (k * lmbd) ** 2)
                p_val += term
                if abs(term) < 1e-10:
                    break
            p_val = max(0.0, min(1.0, p_val))

        return round(d_max, 6), round(p_val, 6)

    def evaluate_metric_divergence(
        self, metric_name: str, baseline_samples: List[float], live_samples: List[float]
    ) -> Dict[str, Any]:
        """
        Evaluates distribution shift for a specific biometric feature (e.g., yaw_angle, saccade_velocity).
        """
        d_stat, p_value = self.compute_ks_2samp(baseline_samples, live_samples)
        is_divergent = (d_stat >= self.critical_d_threshold) and (p_value <= self.significance_alpha)

        return {
            "metric": metric_name,
            "baseline_sample_count": len(baseline_samples),
            "live_sample_count": len(live_samples),
            "ks_d_statistic": d_stat,
            "p_value": p_value,
            "divergence_detected": is_divergent,
        }

    def evaluate_session_profile(
        self,
        baseline_profile: Dict[str, List[float]],
        live_profile: Dict[str, List[float]],
    ) -> Dict[str, Any]:
        """
        Evaluates a complete multi-metric session profile against enrollment baselines.
        """
        results = {}
        divergent_count = 0
        total_metrics = 0

        for metric_name, baseline_data in baseline_profile.items():
            if metric_name in live_profile:
                eval_res = self.evaluate_metric_divergence(
                    metric_name, baseline_data, live_profile[metric_name]
                )
                results[metric_name] = eval_res
                total_metrics += 1
                if eval_res["divergence_detected"]:
                    divergent_count += 1

        overall_violation = divergent_count >= 2 or (
            total_metrics == 1 and divergent_count == 1
        )
        risk_score = round(divergent_count / max(1, total_metrics), 4)

        return {
            "total_metrics_evaluated": total_metrics,
            "divergent_metrics_count": divergent_count,
            "metric_results": results,
            "overall_risk_score": risk_score,
            "violation_flagged": overall_violation,
            "explanation": (
                f"Flagged statistically significant distribution shift in {divergent_count}/{total_metrics} metrics "
                f"(KS D-stat >= {self.critical_d_threshold}, p <= {self.significance_alpha})."
                if overall_violation
                else "Live session telemetry matches baseline distribution within statistical bounds."
            ),
        }
