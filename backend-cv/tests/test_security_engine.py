import time

from agents.security_engine import (
    GestureRecognitionEngine,
    HybridGazeTracker,
    KSAnomalyDetector,
    LivenessVerifier,
)
from agents.fusion import FusionEngine


def test_ks_detector_flags_shifted_distribution():
    detector = KSAnomalyDetector()
    detector.fit_baseline([0.10, 0.12, 0.14, 0.11, 0.13, 0.15, 0.12, 0.14])

    anomalous = detector.is_anomalous([0.70, 0.72, 0.74, 0.71, 0.73, 0.75, 0.72, 0.74])

    assert anomalous is True


def test_hybrid_tracker_produces_screen_coordinates():
    tracker = HybridGazeTracker()

    for _ in range(5):
        tracker.update_gaze(pitch=4.0, yaw=8.0, nose_x=0.5, nose_y=0.5, depth=0.65)

    estimate = tracker.latest_estimate()

    assert estimate["screen_x"] > 0.0
    assert estimate["screen_y"] > 0.0
    assert estimate["confidence"] >= 0.7


def test_gesture_engine_detects_hand_to_ear():
    engine = GestureRecognitionEngine()

    for _ in range(70):
        engine.update_frame(
            left_wrist={"x": 0.18, "y": 0.20, "z": 0.0},
            right_wrist={"x": 0.8, "y": 0.8, "z": 0.0},
            head_pitch=8.0,
            head_yaw=0.0,
            face_count=1,
        )

    assert engine.latest_gesture() == "hand_to_ear"


def test_fusion_engine_requires_multiple_channels():
    engine = FusionEngine()
    now = time.time()
    engine.process_packet("GAZE", now, 0.82, "gaze deviation", True)
    engine.process_packet("GESTURE", now, 0.79, "gesture anomaly", True)
    engine.process_packet("AUDIO", now, 0.74, "audio anomaly", True)
    engine.process_packet("KEYSTROKE", now, 0.20, "", False)
    engine.process_packet("ENVIRONMENT", now, 0.18, "", False)

    decision = engine.process_packet("GAZE", now, 0.82, "gaze deviation", True)

    assert decision["channel_deviations"] == 3
    assert decision["action_level"] == "MEDIUM_FLAG"
    assert decision["integrity_score"] <= 62.0


def test_liveness_verifier_accepts_live_signal():
    verifier = LivenessVerifier()
    verdict = verifier.evaluate(pupil_response_latency_ms=180.0, bpm=78.0, signal_quality=0.91)

    assert verdict["is_live"] is True
    assert verdict["liveness_score"] >= 0.9
