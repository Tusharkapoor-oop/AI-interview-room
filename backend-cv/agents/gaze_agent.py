import math
from typing import List, Dict, Any, Tuple
from .ks_test import kolmogorov_smirnov_2samp


class GazeFixationPoint:
    def __init__(self, timestamp_s: float, x: float, y: float, duration_ms: float):
        self.timestamp_s = timestamp_s
        self.x = max(0.0, min(1.0, float(x)))
        self.y = max(0.0, min(1.0, float(y)))
        self.duration_ms = float(duration_ms)


class AnswerEvent:
    def __init__(self, timestamp_s: float, question_difficulty: float, latency_s: float):
        self.timestamp_s = float(timestamp_s)
        self.question_difficulty = max(0.0, min(1.0, float(question_difficulty)))
        self.latency_s = float(latency_s)


DEFAULT_OVERLAY_REGIONS = [
    (0.05, 0.70, 0.45, 0.95),
    (0.55, 0.05, 0.95, 0.25),
]

EXPECTED_PLR_LATENCY_MS_MIN = 180.0
EXPECTED_PLR_LATENCY_MS_MAX = 320.0


class GazeAgentEvaluator:

    def __init__(
        self,
        active_ui_regions: List[Tuple[float, float, float, float]] = None,
        overlay_regions: List[Tuple[float, float, float, float]] = None,
        cluster_radius_threshold: float = 0.08,
        min_cluster_duration_ms: float = 1200.0,
        violation_ratio_threshold: float = 0.25,
        ks_stat_threshold: float = 0.30,
        lag_loop_min_latency_s: float = 0.8,
        lag_loop_correlation_threshold: float = -0.3,
        overlay_cluster_radius: float = 0.06,
        overlay_duration_threshold_ms: float = 800.0,
    ):
        if active_ui_regions is None:
            self.active_ui_regions = [
                (0.05, 0.15, 0.65, 0.85),
                (0.70, 0.05, 0.95, 0.45),
            ]
        else:
            self.active_ui_regions = active_ui_regions

        self.overlay_regions = overlay_regions or DEFAULT_OVERLAY_REGIONS
        self.cluster_radius_threshold = cluster_radius_threshold
        self.min_cluster_duration_ms = min_cluster_duration_ms
        self.violation_ratio_threshold = violation_ratio_threshold
        self.ks_stat_threshold = ks_stat_threshold
        self.lag_loop_min_latency_s = lag_loop_min_latency_s
        self.lag_loop_correlation_threshold = lag_loop_correlation_threshold
        self.overlay_cluster_radius = overlay_cluster_radius
        self.overlay_duration_threshold_ms = overlay_duration_threshold_ms

    def is_in_active_region(self, x: float, y: float) -> bool:
        for x_min, y_min, x_max, y_max in self.active_ui_regions:
            if x_min <= x <= x_max and y_min <= y <= y_max:
                return True
        return False

    def is_in_overlay_region(self, x: float, y: float) -> bool:
        for x_min, y_min, x_max, y_max in self.overlay_regions:
            if x_min <= x <= x_max and y_min <= y <= y_max:
                return True
        return False

    def evaluate_fixation_stream(
        self,
        fixations: List[GazeFixationPoint],
        enrollment_x: List[float] = None,
        enrollment_y: List[float] = None,
    ) -> Dict[str, Any]:
        if not fixations:
            return {
                "total_fixations": 0,
                "total_duration_ms": 0.0,
                "whitespace_duration_ms": 0.0,
                "whitespace_ratio": 0.0,
                "suspicious_clusters_detected": 0,
                "overlay_region_clusters": 0,
                "ks_gaze_divergence": None,
                "ks_divergence_flagged": False,
                "risk_score": 0.0,
                "violation_flagged": False,
                "explanation": "No gaze fixation points provided for evaluation.",
            }

        total_duration_ms = sum(f.duration_ms for f in fixations)
        if total_duration_ms <= 0.0:
            total_duration_ms = 1e-6

        whitespace_fixations = [f for f in fixations if not self.is_in_active_region(f.x, f.y)]
        whitespace_duration_ms = sum(f.duration_ms for f in whitespace_fixations)
        whitespace_ratio = whitespace_duration_ms / total_duration_ms

        overlay_fixations = [f for f in fixations if self.is_in_overlay_region(f.x, f.y)]

        clusters: List[List[GazeFixationPoint]] = []
        for point in whitespace_fixations:
            assigned = False
            for cluster in clusters:
                cx = sum(p.x for p in cluster) / len(cluster)
                cy = sum(p.y for p in cluster) / len(cluster)
                dist = math.hypot(point.x - cx, point.y - cy)
                if dist <= self.cluster_radius_threshold:
                    cluster.append(point)
                    assigned = True
                    break
            if not assigned:
                clusters.append([point])

        suspicious_clusters = [
            c for c in clusters if sum(p.duration_ms for p in c) >= self.min_cluster_duration_ms
        ]

        # === NEW: Overlay-specific clustering ===
        overlay_clusters: List[List[GazeFixationPoint]] = []
        for point in overlay_fixations:
            assigned = False
            for cluster in overlay_clusters:
                cx = sum(p.x for p in cluster) / len(cluster)
                cy = sum(p.y for p in cluster) / len(cluster)
                dist = math.hypot(point.x - cx, point.y - cy)
                if dist <= self.overlay_cluster_radius:
                    cluster.append(point)
                    assigned = True
                    break
            if not assigned:
                overlay_clusters.append([point])

        suspicious_overlay_clusters = [
            c for c in overlay_clusters
            if sum(p.duration_ms for p in c) >= self.overlay_duration_threshold_ms
        ]

        # === KS-test gaze distribution divergence (p-value based per AEGIS §10.2) ===
        ks_divergence_flagged = False
        ks_result = None
        if enrollment_x and enrollment_y and len(enrollment_x) >= 10 and len(fixations) >= 10:
            live_x = [f.x for f in fixations]
            live_y = [f.y for f in fixations]
            d_x, p_x = kolmogorov_smirnov_2samp(enrollment_x, live_x)
            d_y, p_y = kolmogorov_smirnov_2samp(enrollment_y, live_y)
            max_d = max(d_x, d_y)
            ks_divergence_flagged = (p_x < 0.05 or p_y < 0.05) and max_d > self.ks_stat_threshold
            ks_result = {
                "ks_d_x": d_x,
                "p_value_x": p_x,
                "ks_d_y": d_y,
                "p_value_y": p_y,
                "max_d": max_d,
                "divergence_flagged": ks_divergence_flagged,
            }

        # === Risk score calculation ===
        ratio_penalty = min(1.0, whitespace_ratio / max(1e-6, self.violation_ratio_threshold))
        cluster_penalty = min(1.0, len(suspicious_clusters) * 0.4)
        overlay_cluster_penalty = min(1.0, len(suspicious_overlay_clusters) * 0.5)
        ks_penalty = 0.3 if ks_divergence_flagged else 0.0

        risk_score = round(
            0.35 * ratio_penalty
            + 0.25 * cluster_penalty
            + 0.25 * overlay_cluster_penalty
            + 0.15 * ks_penalty,
            6,
        )

        violation_flagged = (
            whitespace_ratio >= self.violation_ratio_threshold
            or len(suspicious_clusters) > 0
            or len(suspicious_overlay_clusters) >= 2
            or ks_divergence_flagged
        )

        violations = []
        if whitespace_ratio >= self.violation_ratio_threshold:
            violations.append(f"whitespace_ratio={whitespace_ratio:.1%}")
        if suspicious_clusters:
            violations.append(f"{len(suspicious_clusters)} whitespace cluster(s)")
        if suspicious_overlay_clusters:
            violations.append(f"{len(suspicious_overlay_clusters)} overlay cluster(s)")
        if ks_divergence_flagged:
            violations.append("gaze distribution divergence (KS)")

        return {
            "total_fixations": len(fixations),
            "total_duration_ms": round(total_duration_ms, 2),
            "whitespace_duration_ms": round(whitespace_duration_ms, 2),
            "whitespace_ratio": round(whitespace_ratio, 4),
            "suspicious_clusters_detected": len(suspicious_clusters),
            "overlay_region_clusters": len(suspicious_overlay_clusters),
            "overlay_cluster_details": [
                {
                    "centroid_x": round(sum(p.x for p in c) / len(c), 4),
                    "centroid_y": round(sum(p.y for p in c) / len(c), 4),
                    "duration_ms": round(sum(p.duration_ms for p in c), 2),
                    "point_count": len(c),
                }
                for c in suspicious_overlay_clusters
            ],
            "ks_gaze_divergence": ks_result,
            "ks_divergence_flagged": ks_divergence_flagged,
            "cluster_details": [
                {
                    "centroid_x": round(sum(p.x for p in c) / len(c), 4),
                    "centroid_y": round(sum(p.y for p in c) / len(c), 4),
                    "duration_ms": round(sum(p.duration_ms for p in c), 2),
                    "point_count": len(c),
                }
                for c in suspicious_clusters
            ],
            "risk_score": risk_score,
            "violation_flagged": violation_flagged,
            "violation_reasons": violations,
            "explanation": (
                f"Flagged {len(violations)} gaze violation(s): {'; '.join(violations)}."
                if violation_flagged
                else "Normal gaze distribution within active UI interface bounds."
            ),
        }

    def evaluate_lag_loop(self, answers: List[AnswerEvent]) -> Dict[str, Any]:
        if len(answers) < 4:
            return {
                "samples": len(answers),
                "mean_latency_s": 0.0,
                "latency_std_s": 0.0,
                "difficulty_latency_correlation": 0.0,
                "lag_loop_detected": False,
                "risk_score": 0.0,
            }

        difficulties = [a.question_difficulty for a in answers]
        latencies = [a.latency_s for a in answers]

        mean_latency = sum(latencies) / len(latencies)
        variance = sum((lt - mean_latency) ** 2 for lt in latencies) / len(latencies)
        latency_std = math.sqrt(variance)

        n = len(difficulties)
        mean_d = sum(difficulties) / n
        mean_l = mean_latency
        num = 0.0
        den_d = 0.0
        den_l = 0.0
        for i in range(n):
            dd = difficulties[i] - mean_d
            dl = latencies[i] - mean_l
            num += dd * dl
            den_d += dd * dd
            den_l += dl * dl

        correlation = 0.0
        if den_d > 0 and den_l > 0:
            correlation = num / math.sqrt(den_d * den_l)

        lag_loop_detected = (
            mean_latency >= self.lag_loop_min_latency_s
            and correlation >= self.lag_loop_correlation_threshold
            and latency_std <= mean_latency * 0.4
        )

        return {
            "samples": n,
            "mean_latency_s": round(mean_latency, 3),
            "latency_std_s": round(latency_std, 3),
            "difficulty_latency_correlation": round(correlation, 4),
            "lag_loop_detected": lag_loop_detected,
            "risk_score": 0.6 if lag_loop_detected else 0.0,
            "explanation": (
                f"Lag loop signature detected: mean latency {mean_latency:.2f}s "
                f"with low variance ({latency_std:.2f}s) and weak difficulty correlation ({correlation:.2f}). "
                f"Consistent with overlay tool response delay."
                if lag_loop_detected
                else f"Normal answer latency pattern ({mean_latency:.2f}s mean, correlation={correlation:.2f})."
            ),
        }

    def evaluate_plr_latency(self, light_change_timestamps: List[float], pupil_diameter_timestamps: List[float],
                             pupil_diameters: List[float]) -> Dict[str, Any]:
        if len(light_change_timestamps) < 1 or len(pupil_diameters) < 5:
            return {
                "plr_latency_ms": None,
                "plr_latency_plausible": False,
                "risk_score": 0.0,
                "explanation": "Insufficient data for PLR latency evaluation.",
            }

        latencies_ms = []
        for change_ts in light_change_timestamps:
            for i in range(1, len(pupil_diameters)):
                if pupil_diameters[i] < pupil_diameters[i - 1] * 0.95:
                    reaction_ts = pupil_diameter_timestamps[i]
                    latency_ms = (reaction_ts - change_ts) * 1000.0
                    if 50.0 <= latency_ms <= 1000.0:
                        latencies_ms.append(latency_ms)
                    break

        if not latencies_ms:
            return {
                "plr_latency_ms": None,
                "plr_latency_plausible": False,
                "risk_score": 0.2,
                "explanation": "No PLR constriction detected in response to light stimulus.",
            }

        mean_latency = sum(latencies_ms) / len(latencies_ms)
        plausible = EXPECTED_PLR_LATENCY_MS_MIN <= mean_latency <= EXPECTED_PLR_LATENCY_MS_MAX

        return {
            "plr_latency_ms": round(mean_latency, 1),
            "plr_latency_plausible": plausible,
            "risk_score": 0.0 if plausible else 0.3,
            "explanation": (
                f"PLR latency {mean_latency:.0f}ms is within biological range ({EXPECTED_PLR_LATENCY_MS_MIN}-{EXPECTED_PLR_LATENCY_MS_MAX}ms)."
                if plausible
                else f"PLR latency {mean_latency:.0f}ms outside biological range — possible video replay attack."
            ),
        }
