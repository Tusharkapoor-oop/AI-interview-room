"""
AEGIS Research Institute — Next-Generation Backend AI Evaluation Blueprint
Module: Gaze Agent (Whitespace Fixation & Saccadic Entropy Evaluation)
Strict Rule Compliance: [ZERO-COMPROMISE-1] — Pure backend statistical evaluation engine.

Evaluates high-precision gaze fixation vectors against active interface bounding boxes.
Detects clustering in low-entropy / whitespace regions indicative of invisible overlay tools
(e.g., Cluely, FinalRound AI) or physical off-camera notes.
"""

import math
from typing import List, Dict, Any, Tuple


class GazeFixationPoint:
    def __init__(self, timestamp_s: float, x: float, y: float, duration_ms: float):
        self.timestamp_s = timestamp_s
        self.x = max(0.0, min(1.0, float(x)))
        self.y = max(0.0, min(1.0, float(y)))
        self.duration_ms = float(duration_ms)


class GazeAgentEvaluator:
    """
    Statistical Gaze Evaluator implementing Section 11.1 (Whitespace Fixation Detection).
    """

    def __init__(
        self,
        active_ui_regions: List[Tuple[float, float, float, float]] = None,
        cluster_radius_threshold: float = 0.08,
        min_cluster_duration_ms: float = 1200.0,
        violation_ratio_threshold: float = 0.25,
    ):
        """
        :param active_ui_regions: List of bounding boxes (x_min, y_min, x_max, y_max)
                                  defining legitimate UI interaction zones (e.g. IDE, interviewer video).
        :param cluster_radius_threshold: Euclidean distance threshold for spatial clustering.
        :param min_cluster_duration_ms: Minimum cumulative duration in whitespace to flag a cluster.
        :param violation_ratio_threshold: Fraction of total fixation duration spent in whitespace before raising alert.
        """
        # Default active regions: Editor panel center-left [0.05, 0.15, 0.65, 0.85] and Video panel top-right [0.70, 0.05, 0.95, 0.45]
        if active_ui_regions is None:
            self.active_ui_regions = [
                (0.05, 0.15, 0.65, 0.85),
                (0.70, 0.05, 0.95, 0.45),
            ]
        else:
            self.active_ui_regions = active_ui_regions

        self.cluster_radius_threshold = cluster_radius_threshold
        self.min_cluster_duration_ms = min_cluster_duration_ms
        self.violation_ratio_threshold = violation_ratio_threshold

    def is_in_active_region(self, x: float, y: float) -> bool:
        """Checks if normalized point (x, y) falls inside any legitimate UI active region."""
        for x_min, y_min, x_max, y_max in self.active_ui_regions:
            if x_min <= x <= x_max and y_min <= y <= y_max:
                return True
        return False

    def evaluate_fixation_stream(self, fixations: List[GazeFixationPoint]) -> Dict[str, Any]:
        """
        Analyzes a sequence of gaze fixation points over an evaluation window.
        Returns statistical metrics and fraud risk scores.
        """
        if not fixations:
            return {
                "total_fixations": 0,
                "total_duration_ms": 0.0,
                "whitespace_duration_ms": 0.0,
                "whitespace_ratio": 0.0,
                "suspicious_clusters_detected": 0,
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

        # Perform spatial agglomerative clustering on whitespace fixations
        clusters: List[List[GazeFixationPoint]] = []
        for point in whitespace_fixations:
            assigned = False
            for cluster in clusters:
                # Calculate distance to cluster centroid
                cx = sum(p.x for p in cluster) / len(cluster)
                cy = sum(p.y for p in cluster) / len(cluster)
                dist = math.hypot(point.x - cx, point.y - cy)
                if dist <= self.cluster_radius_threshold:
                    cluster.append(point)
                    assigned = True
                    break
            if not assigned:
                clusters.append([point])

        # Filter clusters exceeding duration threshold
        suspicious_clusters = [
            c for c in clusters if sum(p.duration_ms for p in c) >= self.min_cluster_duration_ms
        ]

        # Calculate risk score [0.0, 1.0]
        ratio_penalty = min(1.0, whitespace_ratio / max(1e-6, self.violation_ratio_threshold))
        cluster_penalty = min(1.0, len(suspicious_clusters) * 0.4)
        risk_score = round(0.6 * ratio_penalty + 0.4 * cluster_penalty, 6)

        violation_flagged = (
            whitespace_ratio >= self.violation_ratio_threshold or len(suspicious_clusters) > 0
        )

        return {
            "total_fixations": len(fixations),
            "total_duration_ms": round(total_duration_ms, 2),
            "whitespace_duration_ms": round(whitespace_duration_ms, 2),
            "whitespace_ratio": round(whitespace_ratio, 4),
            "suspicious_clusters_detected": len(suspicious_clusters),
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
            "explanation": (
                f"Flagged {len(suspicious_clusters)} prolonged fixation cluster(s) in UI whitespace. "
                f"Whitespace duration ratio: {whitespace_ratio:.1%}."
                if violation_flagged
                else "Normal gaze distribution within active UI interface bounds."
            ),
        }
