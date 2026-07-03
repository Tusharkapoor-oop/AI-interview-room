"""
AEGIS Research Institute — Next-Generation Backend AI Evaluation Blueprint
Module: Kinematic Agent (33-Keypoint Skeletal Surveillance & Gesture Evaluator)
Strict Rule Compliance: [ZERO-COMPROMISE-1] — Pure backend statistical evaluation engine.

Analyzes normalized 33-keypoint skeletal structures (BlazePose / MediaPipe topology) to detect
hand-to-ear anomalies (hidden earpieces), off-camera wrist reach (secondary devices), and
multi-person bounding box intrusions.
"""

import math
from typing import List, Dict, Any, Optional, Tuple


class Keypoint3D:
    def __init__(self, index: int, x: float, y: float, z: float, visibility: float = 1.0):
        self.index = index
        self.x = float(x)
        self.y = float(y)
        self.z = float(z)
        self.visibility = float(visibility)


class SkeletalFrame:
    def __init__(self, timestamp_s: float, keypoints: List[Keypoint3D], person_id: int = 0):
        self.timestamp_s = timestamp_s
        self.keypoints = {kp.index: kp for kp in keypoints}
        self.person_id = person_id


class KinematicAgentEvaluator:
    """
    Implements Section 6: Advanced Kinematic Surveillance & Multi-Person Evaluation.
    """

    # MediaPipe pose indices
    NOSE = 0
    LEFT_EAR = 7
    RIGHT_EAR = 8
    LEFT_SHOULDER = 11
    RIGHT_SHOULDER = 12
    LEFT_WRIST = 15
    RIGHT_WRIST = 16

    def __init__(
        self,
        ear_reach_threshold: float = 0.08,
        off_camera_margin: float = 0.02,
        min_visibility: float = 0.5,
    ):
        """
        :param ear_reach_threshold: Normalized Euclidean distance below which wrist-to-ear contact is flagged.
        :param off_camera_margin: Normalized margin outside [0, 1] frame bounds indicating off-screen reach.
        :param min_visibility: Minimum keypoint visibility confidence score.
        """
        self.ear_reach_threshold = ear_reach_threshold
        self.off_camera_margin = off_camera_margin
        self.min_visibility = min_visibility

    @staticmethod
    def euclidean_dist(kp1: Keypoint3D, kp2: Keypoint3D) -> float:
        return math.hypot(kp1.x - kp2.x, kp1.y - kp2.y)

    def evaluate_frame(self, skeletons: List[SkeletalFrame]) -> Dict[str, Any]:
        """
        Evaluates a single video frame containing one or more detected skeletons.
        """
        if not skeletons:
            return {
                "skeleton_count": 0,
                "multi_person_flag": False,
                "hand_to_ear_flag": False,
                "off_camera_reach_flag": False,
                "risk_score": 0.0,
                "explanation": "No skeletons detected in frame.",
            }

        multi_person_flag = len(skeletons) > 1
        hand_to_ear_flag = False
        off_camera_reach_flag = False
        min_ear_distance = float("inf")

        for skel in skeletons:
            kps = skel.keypoints

            # Check Hand-to-Ear proximity
            for wrist_idx, ear_idx in [
                (self.LEFT_WRIST, self.LEFT_EAR),
                (self.RIGHT_WRIST, self.RIGHT_EAR),
            ]:
                if wrist_idx in kps and ear_idx in kps:
                    wrist = kps[wrist_idx]
                    ear = kps[ear_idx]
                    if wrist.visibility >= self.min_visibility and ear.visibility >= self.min_visibility:
                        dist = self.euclidean_dist(wrist, ear)
                        if dist < min_ear_distance:
                            min_ear_distance = dist
                        if dist <= self.ear_reach_threshold:
                            hand_to_ear_flag = True

            # Check Off-Camera reach (wrists extending outside normalized frame [0, 1])
            for wrist_idx in [self.LEFT_WRIST, self.RIGHT_WRIST]:
                if wrist_idx in kps:
                    wrist = kps[wrist_idx]
                    if wrist.visibility >= self.min_visibility:
                        if (
                            wrist.x < -self.off_camera_margin
                            or wrist.x > 1.0 + self.off_camera_margin
                            or wrist.y > 1.0 + self.off_camera_margin
                        ):
                            off_camera_reach_flag = True

        # Calculate risk score
        risk_score = 0.0
        if multi_person_flag:
            risk_score += 0.5
        if hand_to_ear_flag:
            risk_score += 0.35
        if off_camera_reach_flag:
            risk_score += 0.25
        risk_score = min(1.0, round(risk_score, 4))

        violation_flagged = multi_person_flag or hand_to_ear_flag or (off_camera_reach_flag and risk_score >= 0.5)

        explanations = []
        if multi_person_flag:
            explanations.append(f"Detected {len(skeletons)} distinct individuals in frame.")
        if hand_to_ear_flag:
            explanations.append(f"Flagged hand-to-ear reach anomaly (min distance: {min_ear_distance:.3f}).")
        if off_camera_reach_flag:
            explanations.append("Flagged wrist extension outside visible camera boundary.")
        if not explanations:
            explanations.append("Normal posture and kinematic bounds verified.")

        return {
            "skeleton_count": len(skeletons),
            "multi_person_flag": multi_person_flag,
            "hand_to_ear_flag": hand_to_ear_flag,
            "min_ear_distance": round(min_ear_distance, 4) if min_ear_distance != float("inf") else None,
            "off_camera_reach_flag": off_camera_reach_flag,
            "risk_score": risk_score,
            "violation_flagged": violation_flagged,
            "explanation": " ".join(explanations),
        }
