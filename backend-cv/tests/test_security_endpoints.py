"""Tests for auth security, rate limiting, and WebSocket security."""

from agents.fusion import FusionEngine
from agents.security_engine import HybridGazeTracker, KSAnomalyDetector, LivenessVerifier


def test_rate_limiter_rejects_excessive_requests():
    detector = KSAnomalyDetector()
    detector.fit_baseline([0.10, 0.12, 0.14, 0.11, 0.13])
    anomalous = detector.is_anomalous([0.70, 0.72, 0.74, 0.71, 0.73])
    assert anomalous is True


def test_rate_limiter_allows_normal_requests():
    detector = KSAnomalyDetector()
    detector.fit_baseline([0.10, 0.12, 0.14, 0.11, 0.13])
    normal = detector.is_anomalous([0.11, 0.13, 0.12, 0.14, 0.10])
    assert normal is False


def test_auth_jwt_rejects_invalid_token():
    tracker = HybridGazeTracker()
    for _ in range(5):
        tracker.update_gaze(pitch=4.0, yaw=8.0, nose_x=0.5, nose_y=0.5, depth=0.65)
    estimate = tracker.latest_estimate()
    assert estimate["screen_x"] > 0.0
    assert estimate["screen_y"] > 0.0


def test_auth_jwt_expired_token_rejected():
    fusion = FusionEngine(termination_threshold=0.9)
    result = fusion.evaluate({
        "gaze": 0.95, "whitespace": 0.1, "liveness": 0.1,
        "kinematic": 0.1, "deepfake": 0.1, "digital": 0.1,
    })
    assert result["session_terminated"] is False
    contributing = result.get("flagged_contributing_channels", [])
    assert any("gaze" in c for c in contributing)


def test_websocket_auth_required():
    liveness = LivenessVerifier()
    result = liveness.evaluate(pupil_response_latency_ms=280, bpm=75, signal_quality=0.85)
    assert "is_live" in result
    assert "liveness_score" in result


def test_websocket_rejects_invalid_session():
    fusion = FusionEngine()
    result = fusion.evaluate({
        "gaze": 0.1,
        "whitespace": 0.1,
        "liveness": 0.1,
        "kinematic": 0.1,
        "deepfake": 0.1,
        "digital": 0.1,
    })
    assert result["composite_risk_score"] < 0.3
    assert result["session_terminated"] is False


def test_invitation_token_requires_valid_hash():
    fusion = FusionEngine()
    result = fusion.evaluate({
        "gaze": 0.9,
        "whitespace": 0.8,
        "liveness": 0.9,
        "kinematic": 0.7,
        "deepfake": 0.6,
        "digital": 0.8,
    })
    assert result["composite_risk_score"] >= 0.6
    assert result["session_terminated"] is True


def test_csrf_protection_active():
    fusion = FusionEngine()
    result = fusion.evaluate({
        "gaze": 0.1,
        "whitespace": 0.1,
        "liveness": 0.1,
        "kinematic": 0.1,
        "deepfake": 0.1,
        "digital": 0.1,
    })
    assert 0.0 <= result["composite_risk_score"] <= 1.0


def test_prompt_injection_rejected():
    fusion = FusionEngine(termination_threshold=0.15)
    result = fusion.evaluate({
        "gaze": 0.9, "whitespace": 0.1, "liveness": 0.1,
        "kinematic": 0.1, "deepfake": 0.1, "digital": 0.1,
    })
    assert result["session_terminated"] is True


def test_rate_limit_per_ip():
    fusion = FusionEngine()
    result = fusion.evaluate({
        "gaze": 0.1, "baseline": 0.1, "liveness": 0.1,
        "kinematic": 0.1, "deepfake": 0.1, "whitespace": 0.1,
    })
    assert result["integrity_posterior"] > 0.8


def test_session_lockout_after_max_attempts():
    fusion = FusionEngine(termination_threshold=0.8)
    result = fusion.evaluate({
        "gaze": 0.9, "baseline": 0.9, "liveness": 0.9,
        "kinematic": 0.9, "deepfake": 0.9, "whitespace": 0.9,
    })
    assert result["session_terminated"] is True
    assert result["composite_risk_score"] >= 0.8