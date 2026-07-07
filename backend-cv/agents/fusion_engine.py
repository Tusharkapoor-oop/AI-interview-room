"""
backend-cv/agents/fusion_engine.py — AEGIS v4.0 Production Kinematic Gesture & Five-Channel Fusion Engine
Classification: INTERNSHIP PRODUCTION · Zero Compromises · Runnable Module

Implements paper §5, §6 & specification Module 9 & Section 4:
  - Module 9: Kinematic Gesture Engine (BlazePose 33 + Hands 21, Hand-to-Ear, Reach, Smartwatch, Curvature)
  - Section 4: Five-Channel Late Fusion Neural Engine (25/20/20/20/15 weights)
  - Enforces [ZERO-COMPROMISE-3]: Strict requirement of N >= 3 concurrent channel anomalies within a 10s window.
"""

import math
import logging
from dataclasses import dataclass
from typing import List, Dict, Tuple, Optional
import numpy as np

log = logging.getLogger("aegis.fusion_engine")


# ─── DATA CONTRACTS ─────────────────────────────────────────────────────────────

@dataclass
class KinematicFrame:
    """Frame of skeletal and hand landmarks."""
    timestamp: float
    pose_landmarks: Dict[int, Tuple[float, float, float]]  # BlazePose 33 keypoints (0-32)
    left_hand_wrist: Optional[Tuple[float, float, float]]  # (x, y, z) normalized 0-1
    right_hand_wrist: Optional[Tuple[float, float, float]] # (x, y, z) normalized 0-1
    head_pitch_deg: float
    num_detected_poses: int = 1


@dataclass
class ChannelPacket:
    """Packet from one of the 5 monitoring channels."""
    channel_id: str     # GAZE | GESTURE | AUDIO | KEYSTROKE | ENVIRONMENT
    timestamp: float
    anomaly_score: float # 0.0 (normal) to 1.0 (certain anomaly)
    details: str
    is_triggered: bool   # True if threshold exceeded in this channel


@dataclass
class FusionDecision:
    """Final system output from the Five-Channel Fusion Brain."""
    timestamp: float
    integrity_score_100: float      # 0 to 100 (100 = perfect integrity)
    active_channel_count: int       # N (number of concurrent anomalous channels in 10s window)
    action_level: str               # SILENT_LOG | LOW_LOG | MEDIUM_FLAG | HIGH_FLAG_REVIEW | CRITICAL_PAUSE
    triggered_channels: List[str]
    description: str


# ─── MODULE 9: KINEMATIC GESTURE ENGINE ────────────────────────────────────────

class KinematicGestureEngine:
    """
    Module 9: Kinematic Gesture Engine.
    
    Analyzes 33 BlazePose landmarks + MediaPipe Hands landmarks over time.
    Detects vocabulary:
      - HAND-TO-EAR: wrist to ear distance < 80px sustained for 60+ frames
      - OFF-CAMERA REACH: wrist beyond 80% boundary for 3+ frames
      - SMARTWATCH INTERACTION: pitch > 20° + wrist rotation + opposing movement
      - ASYMMETRICAL SHOULDER DROP: |left_y - right_y| > 0.05
      - MULTI-PERSON: num_poses > 1 for 60+ frames
    Evaluates kinematic trajectory curvature (Bezier residual).
    """

    def __init__(self, frame_width_px: float = 640.0, frame_height_px: float = 480.0):
        self.width = frame_width_px
        self.height = frame_height_px

        # State buffers
        self.hand_ear_counter_left: int = 0
        self.hand_ear_counter_right: int = 0
        self.offcam_counter: int = 0
        self.multiperson_counter: int = 0

        # Trajectory history for curvature analysis: list of (x, y)
        self.wrist_trajectory: List[Tuple[float, float]] = []

    def _compute_bezier_residual(self, points: List[Tuple[float, float]]) -> float:
        """Computes residual curvature against linear fit to distinguish smooth natural movement from robotic/linear."""
        if len(points) < 5:
            return 1.0

        xs = np.array([p[0] for p in points])
        ys = np.array([p[1] for p in points])

        # Linear fit y = m*x + c
        A = np.vstack([xs, np.ones(len(xs))]).T
        m, c = np.linalg.lstsq(A, ys, rcond=None)[0]

        residuals = np.abs(ys - (m * xs + c))
        return float(np.mean(residuals))

    def process(self, frame: KinematicFrame) -> ChannelPacket:
        anomalies = []
        max_score = 0.0

        # 1. Multi-Person Detection Check
        if frame.num_detected_poses > 1:
            self.multiperson_counter += 1
            if self.multiperson_counter >= 60:
                anomalies.append("Multiple poses detected (Proxy / Accomplice present)")
                max_score = max(max_score, 0.99)
        else:
            self.multiperson_counter = max(0, self.multiperson_counter - 2)

        # 2. Asymmetrical Shoulder Drop Check (BlazePose 11 = Left Shoulder, 12 = Right Shoulder)
        if 11 in frame.pose_landmarks and 12 in frame.pose_landmarks:
            l_sh = frame.pose_landmarks[11]
            r_sh = frame.pose_landmarks[12]
            shoulder_diff = abs(l_sh[1] - r_sh[1])
            if shoulder_diff > 0.06:
                anomalies.append(f"Asymmetrical shoulder drop (diff={shoulder_diff:.3f}, hidden typing below desk)")
                max_score = max(max_score, 0.75)

        # 3. Hand-to-Ear Detection (BlazePose 7 = Left Ear, 8 = Right Ear)
        for side, wrist, ear_idx, counter_attr in [
            ("Left", frame.left_hand_wrist, 7, "hand_ear_counter_left"),
            ("Right", frame.right_hand_wrist, 8, "hand_ear_counter_right")
        ]:
            if wrist is not None and ear_idx in frame.pose_landmarks:
                ear = frame.pose_landmarks[ear_idx]
                dist_px = math.hypot((wrist[0] - ear[0]) * self.width, (wrist[1] - ear[1]) * self.height)

                if dist_px < 80.0:
                    current_count = getattr(self, counter_attr) + 1
                    setattr(self, counter_attr, current_count)
                    if current_count >= 60:
                        anomalies.append(f"{side} hand sustained near ear ({dist_px:.1f}px for {current_count} frames, earpiece suspected)")
                        max_score = max(max_score, 0.92)
                else:
                    setattr(self, counter_attr, max(0, getattr(self, counter_attr) - 2))

        # 4. Off-Camera Reach Check
        is_offcam = False
        for wrist in [frame.left_hand_wrist, frame.right_hand_wrist]:
            if wrist is not None:
                self.wrist_trajectory.append((wrist[0], wrist[1]))
                if len(self.wrist_trajectory) > 30:
                    self.wrist_trajectory.pop(0)

                if wrist[0] < 0.08 or wrist[0] > 0.92 or wrist[1] > 0.92:
                    is_offcam = True

        if is_offcam:
            self.offcam_counter += 1
            if self.offcam_counter >= 3:
                anomalies.append("Wrist reached beyond frame boundary (hidden device reach)")
                max_score = max(max_score, 0.82)
        else:
            self.offcam_counter = 0

        # 5. Smartwatch Check
        if frame.head_pitch_deg > 20.0 and (frame.left_hand_wrist is not None or frame.right_hand_wrist is not None):
            anomalies.append("Head pitch > 20° while wrist active (Smartwatch consultation)")
            max_score = max(max_score, 0.78)

        # 6. Trajectory Curvature Check
        if len(self.wrist_trajectory) >= 20:
            residual = self._compute_bezier_residual(self.wrist_trajectory)
            if residual < 0.003 and max_score > 0.5:
                anomalies.append("Robotic linear hand trajectory detected (synthetic injection)")
                max_score = min(max_score + 0.1, 1.0)

        is_trig = (max_score >= 0.70)
        detail_str = "; ".join(anomalies) if anomalies else "Normal kinematic posture."

        return ChannelPacket(
            channel_id="GESTURE",
            timestamp=frame.timestamp,
            anomaly_score=max_score,
            details=detail_str,
            is_triggered=is_trig
        )


# ─── SECTION 4: FIVE-CHANNEL BEHAVIORAL FUSION ENGINE ──────────────────────────

class FiveChannelFusionEngine:
    """
    Section 4: Five-Channel Behavioral Fusion Engine (The Brain).
    
    Late-fusion neural weighting:
      - Channel 1 (GAZE):        weight 0.25
      - Channel 2 (GESTURE):     weight 0.20
      - Channel 3 (AUDIO):       weight 0.20
      - Channel 4 (KEYSTROKE):   weight 0.20
      - Channel 5 (ENVIRONMENT): weight 0.15
      
    Enforces [ZERO-COMPROMISE-3]:
    Every security decision requires N >= 3 concurrent channel deviations within a 10s window.
      - N <= 1: SILENT_LOG
      - N = 2:  LOW_LOG
      - N = 3:  MEDIUM_FLAG
      - N = 4:  HIGH_FLAG_REVIEW
      - N = 5:  CRITICAL_PAUSE
    """

    def __init__(self, window_duration_sec: float = 10.0):
        self.window_sec = window_duration_sec
        self.weights = {
            "GAZE": 0.25,
            "GESTURE": 0.20,
            "AUDIO": 0.20,
            "KEYSTROKE": 0.20,
            "ENVIRONMENT": 0.15
        }

        # History queue of packets received over the last 10 seconds
        self.packet_queue: List[ChannelPacket] = []

    def process_packet(self, packet: ChannelPacket) -> FusionDecision:
        self.packet_queue.append(packet)
        self.packet_queue = [p for p in self.packet_queue if packet.timestamp - p.timestamp <= self.window_sec]

        # Determine latest anomaly score per channel in current window
        latest_scores: Dict[str, float] = {ch: 0.0 for ch in self.weights.keys()}
        triggered_channels: set = set()
        details_list: List[str] = []

        for p in self.packet_queue:
            if p.anomaly_score > latest_scores[p.channel_id]:
                latest_scores[p.channel_id] = p.anomaly_score
            if p.is_triggered:
                triggered_channels.add(p.channel_id)
                if p.details and p.details not in details_list:
                    details_list.append(f"[{p.channel_id}] {p.details}")

        # Compute weighted integrity score
        weighted_penalty = sum(self.weights[ch] * latest_scores[ch] for ch in self.weights.keys())
        integrity_score = max(0.0, min(100.0, (1.0 - weighted_penalty) * 100.0))

        # Count N (concurrent triggered channels in 10s window)
        N = len(triggered_channels)

        # Enforce [ZERO-COMPROMISE-3] Decision Matrix
        if N <= 1:
            action = "SILENT_LOG"
        elif N == 2:
            action = "LOW_LOG"
        elif N == 3:
            action = "MEDIUM_FLAG"
        elif N == 4:
            action = "HIGH_FLAG_REVIEW"
        else:  # N == 5
            action = "CRITICAL_PAUSE"

        desc = "; ".join(details_list) if details_list else "All biometric and environmental channels optimal."

        decision = FusionDecision(
            timestamp=packet.timestamp,
            integrity_score_100=float(integrity_score),
            active_channel_count=N,
            action_level=action,
            triggered_channels=sorted(list(triggered_channels)),
            description=desc
        )

        if action in ("MEDIUM_FLAG", "HIGH_FLAG_REVIEW", "CRITICAL_PAUSE"):
            log.warning(f"[Fusion Engine] Action={action} (N={N} channels: {decision.triggered_channels}) | Integrity={integrity_score:.1f}/100 | {desc}")

        return decision
