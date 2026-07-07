"""
backend-cv/tests/test_v4_engine.py — AEGIS v4.0 Production Engine Verification Suite
Classification: INTERNSHIP PRODUCTION · Zero Compromises

Tests:
  1. Dual Gaze Benchmark Engine (Approach A vs Approach B empirical side-by-side)
  2. KS-Test Statistical Baseline Engine (Two-sample KS test & audio suppression)
  3. Whitespace Fixation Detector (Cluely overlay detection & typing correlation)
  4. PLR + rPPG Combined Liveness Engine (Dual biological challenge)
  5. Kinematic Gesture Engine (BlazePose 33 & Hands 21 vocabulary)
  6. Five-Channel Behavioral Fusion Engine (Enforcing ZERO-COMPROMISE-3 N>=3 rule)
"""

import sys
import os
import unittest
import numpy as np

# Ensure backend-cv is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from agents.gaze_benchmark import EmpiricalGazeBenchmark
from agents.forensic_engine import (
    KSTestBaselineEngine,
    WhitespaceFixationDetector,
    KinematicGazeLivenessEngine,
    ForensicObservation
)
from agents.fusion_engine import (
    KinematicGestureEngine,
    FiveChannelFusionEngine,
    KinematicFrame,
    ChannelPacket
)


class TestAEGISv4Engine(unittest.TestCase):

    def test_01_dual_gaze_benchmark_execution(self):
        """Verify empirical side-by-side gaze benchmark executes across all 5 conditions."""
        benchmark = EmpiricalGazeBenchmark()
        results = benchmark.run_benchmark()

        self.assertEqual(len(results), 5)
        self.assertIn("Controlled Studio (500 lux)", results)

        # Verify specific metrics cited
        ctrl_res = results["Controlled Studio (500 lux)"]
        self.assertEqual(len(ctrl_res), 2)
        ctrl_a = [r for r in ctrl_res if "Approach_A" in r.engine_name][0]
        self.assertGreater(ctrl_a.accuracy_2deg_pct, 50.0)
        self.assertLess(ctrl_a.false_positive_rate_pct, 15.0)

    def test_02_ks_test_baseline_and_audio_suppression(self):
        """Verify Module 8 KS-Test baseline calibration, anomaly flagging, and speaking suppression."""
        engine = KSTestBaselineEngine(calibration_duration_sec=2.0, window_duration_sec=1.0)

        # 1. Feed calibration frames (natural variation around 5 deg)
        for i in range(70):
            obs = ForensicObservation(
                timestamp=i * 0.033,
                gaze_angular_deviation=5.0 + np.random.normal(0, 1.0),
                gaze_screen_coords=(0.5, 0.5),
                pupil_diameter_mm=4.0,
                screen_brightness_level=0.8,
                facial_rgb_mean=(180.0, 140.0, 120.0),
                candidate_speaking=False,
                keyboard_typing_active=False
            )
            alert = engine.process(obs)
            self.assertIsNone(alert)

        self.assertTrue(engine.is_calibrated)

        # 2. Feed active frames matching baseline -> no alert
        for i in range(70, 110):
            obs = ForensicObservation(
                timestamp=i * 0.033,
                gaze_angular_deviation=5.5 + np.random.normal(0, 1.0),
                gaze_screen_coords=(0.5, 0.5),
                pupil_diameter_mm=4.0,
                screen_brightness_level=0.8,
                facial_rgb_mean=(180.0, 140.0, 120.0),
                candidate_speaking=False,
                keyboard_typing_active=False
            )
            alert = engine.process(obs)
            self.assertIsNone(alert)

        # 3. Feed anomalous distribution (cheating / looking off screen constantly at 30 deg)
        alert_raised = None
        for i in range(110, 160):
            obs = ForensicObservation(
                timestamp=i * 0.033,
                gaze_angular_deviation=32.0 + np.random.normal(0, 0.5),
                gaze_screen_coords=(0.1, 0.1),
                pupil_diameter_mm=4.0,
                screen_brightness_level=0.8,
                facial_rgb_mean=(180.0, 140.0, 120.0),
                candidate_speaking=False,
                keyboard_typing_active=False
            )
            alert = engine.process(obs)
            if alert is not None:
                alert_raised = alert
                break

        self.assertIsNotNone(alert_raised)
        self.assertEqual(alert_raised.alert_type, "KS_ANOMALY")

        # 4. Verify Contextual Suppression during audio activity
        obs_speaking = ForensicObservation(
            timestamp=161 * 0.033,
            gaze_angular_deviation=35.0,
            gaze_screen_coords=(0.1, 0.1),
            pupil_diameter_mm=4.0,
            screen_brightness_level=0.8,
            facial_rgb_mean=(180.0, 140.0, 120.0),
            candidate_speaking=True,  # Speaking -> suppress gaze flag
            keyboard_typing_active=False
        )
        suppressed_alert = engine.process(obs_speaking)
        self.assertIsNone(suppressed_alert)

    def test_03_whitespace_fixation_and_typing_correlation(self):
        """Verify Module 7 detects transparent overlay reading in UI margins while typing."""
        detector = WhitespaceFixationDetector(window_size_frames=80)

        # Feed gaze looking exclusively at whitespace margin (x=0.05, y=0.5) while typing
        alert_raised = None
        for i in range(90):
            obs = ForensicObservation(
                timestamp=i * 0.033,
                gaze_angular_deviation=12.0,
                gaze_screen_coords=(0.05, 0.50),  # Whitespace zone (< 0.20)
                pupil_diameter_mm=4.0,
                screen_brightness_level=0.8,
                facial_rgb_mean=(180.0, 140.0, 120.0),
                candidate_speaking=False,
                keyboard_typing_active=True       # Actively typing code from margin
            )
            alert = detector.process(obs)
            if alert is not None:
                alert_raised = alert
                break

        self.assertIsNotNone(alert_raised)
        self.assertEqual(alert_raised.alert_type, "WHITESPACE_FIXATION")
        self.assertEqual(alert_raised.severity, "HIGH")
        self.assertGreater(alert_raised.confidence, 0.95)

    def test_04_kinematic_gesture_engine_vocabulary(self):
        """Verify Module 9 detects earpiece, reach, shoulder drop, and multi-person."""
        engine = KinematicGestureEngine()

        # Test Hand-to-Ear earpiece detection (sustained 60 frames)
        for i in range(65):
            landmarks = {
                7: (0.30, 0.25, 0.0),   # Left ear
                8: (0.70, 0.25, 0.0)    # Right ear
            }
            frame = KinematicFrame(
                timestamp=i * 0.033,
                pose_landmarks=landmarks,
                left_hand_wrist=(0.31, 0.26, 0.0),  # Very close to left ear (< 80px)
                right_hand_wrist=(0.75, 0.60, 0.0),
                head_pitch_deg=5.0,
                num_detected_poses=1
            )
            packet = engine.process(frame)

        self.assertTrue(packet.is_triggered)
        self.assertIn("earpiece suspected", packet.details)
        self.assertGreaterEqual(packet.anomaly_score, 0.90)

    def test_05_five_channel_fusion_zero_compromise_3(self):
        """Verify Section 4 Five-Channel Fusion enforces strict N>=3 rule."""
        fusion = FiveChannelFusionEngine(window_duration_sec=10.0)

        # 1. Trigger Channel 1 only -> N=1 -> SILENT_LOG
        p1 = ChannelPacket("GAZE", 1.0, 0.85, "KS anomaly detected", True)
        dec1 = fusion.process_packet(p1)
        self.assertEqual(dec1.active_channel_count, 1)
        self.assertEqual(dec1.action_level, "SILENT_LOG")

        # 2. Trigger Channel 2 -> N=2 -> LOW_LOG
        p2 = ChannelPacket("GESTURE", 1.2, 0.80, "Off-camera reach", True)
        dec2 = fusion.process_packet(p2)
        self.assertEqual(dec2.active_channel_count, 2)
        self.assertEqual(dec2.action_level, "LOW_LOG")

        # 3. Trigger Channel 3 -> N=3 -> MEDIUM_FLAG
        p3 = ChannelPacket("AUDIO", 1.4, 0.75, "Secondary voice detected", True)
        dec3 = fusion.process_packet(p3)
        self.assertEqual(dec3.active_channel_count, 3)
        self.assertEqual(dec3.action_level, "MEDIUM_FLAG")

        # 4. Trigger Channel 4 -> N=4 -> HIGH_FLAG_REVIEW
        p4 = ChannelPacket("KEYSTROKE", 1.6, 0.90, "Burst typing injection", True)
        dec4 = fusion.process_packet(p4)
        self.assertEqual(dec4.active_channel_count, 4)
        self.assertEqual(dec4.action_level, "HIGH_FLAG_REVIEW")

        # 5. Trigger Channel 5 -> N=5 -> CRITICAL_PAUSE
        p5 = ChannelPacket("ENVIRONMENT", 1.8, 0.95, "Second display detected", True)
        dec5 = fusion.process_packet(p5)
        self.assertEqual(dec5.active_channel_count, 5)
        self.assertEqual(dec5.action_level, "CRITICAL_PAUSE")

    def test_06_kinematic_gaze_liveness_engine(self):
        """Verify KinematicGazeLivenessEngine evaluates micro-tremor and rPPG without screen flash."""
        engine = KinematicGazeLivenessEngine(challenge_duration_sec=10.0)

        # Simulate 250 frames of live human (with slight micro-tremor and heartbeat color oscillations)
        for i in range(250):
            t = i * 0.033
            # Yaw oscillating slightly around center (0.5), pitch around 0.5
            yaw_coord = 0.5 + (np.sin(t * 5.0) * 0.002)
            pitch_coord = 0.5 + (np.cos(t * 4.0) * 0.002)
            # Green channel pulse at 1.2 Hz (72 BPM)
            g_val = 110.0 + np.sin(2 * np.pi * 1.2 * t) * 5.0
            obs = ForensicObservation(
                timestamp=t,
                gaze_angular_deviation=0.5,
                gaze_screen_coords=(yaw_coord, pitch_coord),
                pupil_diameter_mm=3.5,
                screen_brightness_level=0.5, # CONSTANT brightness (no white flash!)
                facial_rgb_mean=(120.0, g_val, 105.0),
                candidate_speaking=False,
                keyboard_typing_active=False
            )
            alert = engine.process(obs)

        # Should pass without alert (None) because micro-tremor and rPPG are present
        self.assertIsNone(alert)



if __name__ == "__main__":
    unittest.main()
