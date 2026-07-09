import math
from typing import List, Dict, Any
from .ks_test import kolmogorov_smirnov_2samp


MIN_ENROLLMENT_SAMPLES = 30
MAX_ENROLLMENT_SAMPLES = 300
BASE_D_THRESHOLD = 0.35


class BaselineAgentEvaluator:

    def __init__(self, significance_alpha: float = 0.005, critical_d_threshold: float = 0.35):
        self.significance_alpha = significance_alpha
        self.critical_d_threshold = critical_d_threshold

    def assess_enrollment_quality(self, baseline_profile: Dict[str, List[float]]) -> Dict[str, Any]:
        """
        Evaluates the quality of enrollment data.
        Short or low-variance enrollment yields wider acceptance thresholds.
        """
        metric_counts = {}
        low_quality_metrics = []

        for metric_name, data in baseline_profile.items():
            n = len(data)
            metric_counts[metric_name] = n
            if n < MIN_ENROLLMENT_SAMPLES:
                low_quality_metrics.append(metric_name)

            if n >= 2:
                mean_val = sum(data) / n
                variance = sum((x - mean_val) ** 2 for x in data) / n
                std_val = math.sqrt(variance)
                if std_val < 1e-6:
                    low_quality_metrics.append(f"{metric_name}(low_variance)")

        total_samples = sum(metric_counts.values())
        avg_samples = total_samples / max(1, len(metric_counts))
        quality_score = min(1.0, avg_samples / MIN_ENROLLMENT_SAMPLES)
        enrollment_adequate = len(low_quality_metrics) == 0

        return {
            "total_samples": total_samples,
            "average_samples_per_metric": round(avg_samples, 1),
            "quality_score": round(quality_score, 4),
            "low_quality_metrics": low_quality_metrics,
            "enrollment_adequate": enrollment_adequate,
            "adaptive_d_threshold": round(
                self.critical_d_threshold * (1.0 + 0.5 * (1.0 - quality_score)),
                4,
            ),
            "explanation": (
                "Enrollment quality adequate for statistical baseline comparison."
                if enrollment_adequate
                else f"Insufficient enrollment data for {len(low_quality_metrics)} metric(s): {', '.join(low_quality_metrics[:3])}. Thresholds widened."
            ),
        }

    def evaluate_metric_divergence(
        self, metric_name: str, baseline_samples: List[float], live_samples: List[float],
        adaptive_threshold: float = None,
    ) -> Dict[str, Any]:
        d_stat, p_value = kolmogorov_smirnov_2samp(baseline_samples, live_samples)
        threshold = adaptive_threshold if adaptive_threshold is not None else self.critical_d_threshold
        is_divergent = (d_stat >= threshold) and (p_value <= self.significance_alpha)

        return {
            "metric": metric_name,
            "baseline_sample_count": len(baseline_samples),
            "live_sample_count": len(live_samples),
            "ks_d_statistic": d_stat,
            "p_value": p_value,
            "threshold_used": threshold,
            "divergence_detected": is_divergent,
        }

    def evaluate_session_profile(
        self,
        baseline_profile: Dict[str, List[float]],
        live_profile: Dict[str, List[float]],
    ) -> Dict[str, Any]:
        enrollment_quality = self.assess_enrollment_quality(baseline_profile)
        adaptive_threshold = enrollment_quality["adaptive_d_threshold"]

        results = {}
        divergent_count = 0
        total_metrics = 0

        for metric_name, baseline_data in baseline_profile.items():
            if metric_name in live_profile:
                eval_res = self.evaluate_metric_divergence(
                    metric_name, baseline_data, live_profile[metric_name],
                    adaptive_threshold=adaptive_threshold,
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
            "enrollment_quality": enrollment_quality,
            "total_metrics_evaluated": total_metrics,
            "divergent_metrics_count": divergent_count,
            "metric_results": results,
            "overall_risk_score": risk_score,
            "adaptive_d_threshold": adaptive_threshold,
            "violation_flagged": overall_violation,
            "explanation": (
                f"Flagged statistically significant distribution shift in {divergent_count}/{total_metrics} metrics "
                f"(KS D >= {adaptive_threshold:.2f}, p <= {self.significance_alpha})."
                if overall_violation
                else "Live session telemetry matches baseline distribution within statistical bounds."
            ),
        }
