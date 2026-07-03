"""
test_omega_engine.py — Empirical Unit Tests for AEGIS-OMEGA 16-Layer Enforcement Engine
Verifies zero-tolerance execution, Gaze-Death 3s rule, 10,000 lux illumination forcing,
subvocal repetition detection, and 99.999% statistical twin kills.
"""

from agents.omega_engine import AegisOmega16LayerEngine


def test_omega_zero_tolerance_execution():
    engine = AegisOmega16LayerEngine()
    # Layer 1: Quantum collagen check fails
    assert engine.verify_layer_1_quantum_collagen(quantum_token_valid=True, collagen_depolarization_ratio=0.80) is False
    strikes, triggered = engine.evaluate_layer_6_zero_tolerance()
    assert strikes == 1
    assert triggered is True
    assert engine.alarm_db_level == 130.0


def test_layer_7_10000_lux_auto_physical_forcing():
    engine = AegisOmega16LayerEngine()
    passed, lux_command = engine.verify_layer_7_face_ear_neck(
        sub_occipital_visible=True,
        ultrasonic_ear_anomaly=False,
        ambient_lux=450.0
    )
    assert passed is True
    assert lux_command == 10000.0


def test_layer_9_gaze_death_rule_3_seconds():
    engine = AegisOmega16LayerEngine(fps=10.0)
    # Simulate 2.8 seconds of off-screen gaze (28 frames)
    for _ in range(28):
        cont, cum, killed = engine.evaluate_layer_9_gaze_death(off_screen_deg=30.0, reading_saccades_detected=False)
    assert cont == 2.8
    assert killed is False

    # 30 frames reaches 3.0 seconds -> instant Gaze-Death kill
    for _ in range(2):
        cont2, cum2, killed2 = engine.evaluate_layer_9_gaze_death(off_screen_deg=30.0, reading_saccades_detected=False)
    assert cont2 >= 3.0
    assert killed2 is True
    assert any(v.violation_type == "CONTINUOUS_GAZE_DEATH_3S" for v in engine.violations)


def test_layer_9_reading_saccades_instant_fatal():
    engine = AegisOmega16LayerEngine()
    cont, cum, killed = engine.evaluate_layer_9_gaze_death(off_screen_deg=5.0, reading_saccades_detected=True)
    assert killed is True
    assert any(v.violation_type == "READING_SACCADE_PATTERN" for v in engine.violations)


def test_layer_16_adversarial_twin_statistical_kill():
    engine = AegisOmega16LayerEngine()
    # Z-score within 99.999% CI (Z = 2.1) passes
    assert engine.verify_layer_16_adversarial_twin(live_candidate_z_score=2.1) is True

    # Z-score exceeding 4.417 triggers statistical kill
    assert engine.verify_layer_16_adversarial_twin(live_candidate_z_score=4.82) is False
    assert engine.omega_termination_triggered is True
    assert any(v.violation_type == "ULTIMATE_STATISTICAL_KILL" for v in engine.violations)
