"""
test_protocol_engine.py — Empirical Unit Tests for AEGIS 12-Layer Protocol Engine
Verifies candidate entry verification, whole screen share requirements, 3-strike auto submit,
5-second look-away timeout, and auto-brightness lux overrides.
"""

from agents.protocol_engine import InvitationCodeValidator, Protocol12LayerEngine


def test_invitation_code_default_ai_passkey():
    valid, msg, payload = InvitationCodeValidator.validate_entry(
        candidate_name="Roy Lee",
        role="software_engineer",
        use_default_ai_code=True
    )
    assert valid is True
    assert payload["invitation_code"] == "AEGIS-VIP-2026"
    assert payload["session_token"].startswith("AEGIS-SESSION-")


def test_invitation_code_invalid_role_or_missing_code():
    valid, msg, _ = InvitationCodeValidator.validate_entry("John Doe", "invalid_role")
    assert valid is False

    valid2, msg2, _ = InvitationCodeValidator.validate_entry("John Doe", "software_engineer", invitation_code="")
    assert valid2 is False


def test_layer_2_screen_share_enforces_whole_monitor():
    engine = Protocol12LayerEngine()
    # Passing single window or tab must fail
    assert engine.verify_layer_2_screen_share(display_surface="window", active_background_tabs=1) is False
    assert len(engine.violations) == 1
    assert engine.violations[0].violation_type == "INVALID_DISPLAY_SURFACE"

    # Whole monitor passes
    assert engine.verify_layer_2_screen_share(display_surface="monitor", active_background_tabs=1) is True


def test_layer_6_three_strike_auto_submit_rule():
    engine = Protocol12LayerEngine()
    engine.add_violation(1, "Layer 1", "ERR_1", "HIGH", "Strike 1")
    engine.add_violation(2, "Layer 2", "ERR_2", "HIGH", "Strike 2")
    strikes, triggered = engine.evaluate_layer_6_strike_rule()
    assert strikes == 2
    assert triggered is False

    engine.add_violation(3, "Layer 3", "ERR_3", "HIGH", "Strike 3")
    strikes2, triggered2 = engine.evaluate_layer_6_strike_rule()
    assert strikes2 == 3
    assert triggered2 is True


def test_layer_7_auto_brightness_lux_override():
    engine = Protocol12LayerEngine()
    # Dark room (<60 lux) should trigger illumination boost
    passed, boost, target_lux = engine.verify_layer_7_face_lux_and_ears(
        ambient_face_lux=35.0,
        left_ear_visible=True,
        right_ear_visible=True
    )
    assert passed is False
    assert boost is True
    assert target_lux >= 100.0


def test_layer_9_five_second_look_away_rule():
    engine = Protocol12LayerEngine(fps=10.0)
    # Simulate looking away for 48 frames (4.8 seconds)
    for _ in range(48):
        dur, rescan = engine.evaluate_layer_9_look_away(gaze_deviation_deg=30.0, is_speaking=False)
    assert dur == 4.8
    assert rescan is False

    # 50 frames reaches 5.0 seconds -> triggers look-away timeout and mandatory room scan
    for _ in range(2):
        dur2, rescan2 = engine.evaluate_layer_9_look_away(gaze_deviation_deg=30.0, is_speaking=False)
    assert dur2 >= 5.0
    assert rescan2 is True
    assert any(v.violation_type == "LOOK_AWAY_TIMEOUT" for v in engine.violations)


def test_layer_10_identity_consistency_checking():
    engine = Protocol12LayerEngine()
    base_embedding = [1.0, 0.0, 0.0]
    engine.verify_layer_10_identity(base_embedding)

    # Same person passes
    assert engine.verify_layer_10_identity([0.98, 0.1, 0.0]) is True

    # Completely different person / face swap fails (< 0.85 cosine sim)
    assert engine.verify_layer_10_identity([0.0, 1.0, 0.0]) is False
