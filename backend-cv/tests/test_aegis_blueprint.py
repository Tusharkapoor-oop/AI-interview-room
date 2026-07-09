import math
from agents.gaze_agent import GazeAgentEvaluator, GazeFixationPoint, AnswerEvent
from agents.baseline_agent import BaselineAgentEvaluator
from agents.kinematic_agent import KinematicAgentEvaluator, SkeletalFrame, Keypoint3D
from agents.liveness_agent import LivenessAgentEvaluator
from agents.deepfake_agent import DeepfakeAgentEvaluator
from agents.fusion_agent import FusionAgentEvaluator, BehavioralChannelScores


def test_gaze_whitespace_fixation_clustering():
    evaluator = GazeAgentEvaluator()

    legit_points = [
        GazeFixationPoint(timestamp_s=0.1 * i, x=0.3, y=0.5, duration_ms=200.0)
        for i in range(10)
    ]
    res_legit = evaluator.evaluate_fixation_stream(legit_points)
    assert not res_legit["violation_flagged"]
    assert res_legit["suspicious_clusters_detected"] == 0

    suspicious_points = [
        GazeFixationPoint(timestamp_s=0.1 * i, x=0.01, y=0.01, duration_ms=250.0)
        for i in range(10)
    ]
    res_suspicious = evaluator.evaluate_fixation_stream(suspicious_points)
    assert res_suspicious["violation_flagged"]
    assert res_suspicious["suspicious_clusters_detected"] == 1


def test_gaze_overlay_region_clustering():
    evaluator = GazeAgentEvaluator()

    overlay_points = [
        GazeFixationPoint(timestamp_s=0.1 * i, x=0.80, y=0.10, duration_ms=300.0)
        for i in range(10)
    ]
    res = evaluator.evaluate_fixation_stream(overlay_points)
    assert res["overlay_region_clusters"] > 0


def test_gaze_ks_baseline_divergence():
    evaluator = GazeAgentEvaluator(ks_stat_threshold=0.30)

    enrollment_x = [0.3 + 0.02 * (i % 5) for i in range(50)]
    enrollment_y = [0.5 + 0.02 * (i % 5) for i in range(50)]

    matching_points = [
        GazeFixationPoint(timestamp_s=0.1 * i, x=0.30 + 0.02 * (i % 5), y=0.50 + 0.02 * (i % 5), duration_ms=150.0)
        for i in range(20)
    ]
    res_match = evaluator.evaluate_fixation_stream(
        matching_points, enrollment_x=enrollment_x, enrollment_y=enrollment_y
    )
    assert not res_match["ks_divergence_flagged"]

    shifted_points = [
        GazeFixationPoint(timestamp_s=0.1 * i, x=0.85, y=0.15, duration_ms=150.0)
        for i in range(20)
    ]
    res_shift = evaluator.evaluate_fixation_stream(
        shifted_points, enrollment_x=enrollment_x, enrollment_y=enrollment_y
    )
    assert res_shift["ks_divergence_flagged"]


def test_gaze_lag_loop_detection():
    evaluator = GazeAgentEvaluator()

    normal_answers = [
        AnswerEvent(timestamp_s=10.0, question_difficulty=0.2, latency_s=3.5),
        AnswerEvent(timestamp_s=30.0, question_difficulty=0.5, latency_s=8.2),
        AnswerEvent(timestamp_s=60.0, question_difficulty=0.8, latency_s=15.1),
        AnswerEvent(timestamp_s=90.0, question_difficulty=0.3, latency_s=4.0),
        AnswerEvent(timestamp_s=120.0, question_difficulty=0.9, latency_s=18.5),
    ]
    res_normal = evaluator.evaluate_lag_loop(normal_answers)
    assert not res_normal["lag_loop_detected"]

    lag_loop_answers = [
        AnswerEvent(timestamp_s=10.0, question_difficulty=0.2, latency_s=2.0),
        AnswerEvent(timestamp_s=30.0, question_difficulty=0.5, latency_s=2.0),
        AnswerEvent(timestamp_s=60.0, question_difficulty=0.8, latency_s=2.0),
        AnswerEvent(timestamp_s=90.0, question_difficulty=0.3, latency_s=2.0),
        AnswerEvent(timestamp_s=120.0, question_difficulty=0.9, latency_s=2.0),
    ]
    res_loop = evaluator.evaluate_lag_loop(lag_loop_answers)
    assert res_loop["lag_loop_detected"]


def test_gaze_plr_latency():
    evaluator = GazeAgentEvaluator()

    light_changes = [1.0]
    pupil_ts = [0.0, 0.5, 1.0, 1.25, 1.5, 2.0]
    pupil_diameters = [5.0, 5.0, 5.0, 3.8, 3.5, 3.5]

    res = evaluator.evaluate_plr_latency(light_changes, pupil_ts, pupil_diameters)
    assert res["plr_latency_plausible"]
    assert 200.0 <= res["plr_latency_ms"] <= 300.0


def test_baseline_ks_test_divergence():
    evaluator = BaselineAgentEvaluator(significance_alpha=0.01, critical_d_threshold=0.35)

    baseline_yaw = [0.05, 0.04, 0.06, 0.05, 0.03, 0.07, 0.05, 0.04]
    live_yaw_normal = [0.05, 0.06, 0.04, 0.05, 0.05, 0.03, 0.06, 0.05]

    eval_normal = evaluator.evaluate_metric_divergence("yaw", baseline_yaw, live_yaw_normal)
    assert not eval_normal["divergence_detected"]
    assert eval_normal["ks_d_statistic"] < 0.35

    live_yaw_shifted = [0.85, 0.88, 0.90, 0.86, 0.89, 0.87, 0.91, 0.85]
    eval_shifted = evaluator.evaluate_metric_divergence("yaw", baseline_yaw, live_yaw_shifted)
    assert eval_shifted["divergence_detected"]
    assert eval_shifted["ks_d_statistic"] >= 0.35


def test_baseline_enrollment_quality():
    evaluator = BaselineAgentEvaluator()

    adequate_profile = {
        "yaw": [0.05 + 0.01 * i for i in range(50)],
        "pitch": [0.10 + 0.01 * i for i in range(50)],
    }
    quality = evaluator.assess_enrollment_quality(adequate_profile)
    assert quality["enrollment_adequate"]
    assert quality["quality_score"] >= 0.5

    poor_profile = {
        "yaw": [0.05] * 5,
    }
    poor_quality = evaluator.assess_enrollment_quality(poor_profile)
    assert not poor_quality["enrollment_adequate"]
    assert poor_quality["adaptive_d_threshold"] > evaluator.critical_d_threshold


def test_baseline_adaptive_threshold():
    evaluator = BaselineAgentEvaluator(critical_d_threshold=0.35)

    poor_profile = {"yaw": [0.05] * 10, "pitch": [0.10] * 10}
    quality = evaluator.assess_enrollment_quality(poor_profile)
    assert quality["adaptive_d_threshold"] > 0.35

    baseline_yaw = [0.05] * 10
    live_yaw = [0.90] * 10
    result = evaluator.evaluate_metric_divergence(
        "yaw", baseline_yaw, live_yaw,
        adaptive_threshold=quality["adaptive_d_threshold"],
    )
    assert result["threshold_used"] > 0.35


def test_kinematic_skeletal_anomalies():
    evaluator = KinematicAgentEvaluator()

    normal_kps = [
        Keypoint3D(index=KinematicAgentEvaluator.LEFT_WRIST, x=0.3, y=0.7, z=0.0),
        Keypoint3D(index=KinematicAgentEvaluator.LEFT_EAR, x=0.45, y=0.2, z=0.0),
    ]
    frame_normal = SkeletalFrame(0.1, normal_kps)
    res_normal = evaluator.evaluate_frame([frame_normal])
    assert not res_normal["violation_flagged"]

    touch_kps = [
        Keypoint3D(index=KinematicAgentEvaluator.LEFT_WRIST, x=0.45, y=0.21, z=0.0),
        Keypoint3D(index=KinematicAgentEvaluator.LEFT_EAR, x=0.45, y=0.20, z=0.0),
    ]
    frame_touch = SkeletalFrame(0.2, touch_kps)
    res_touch = evaluator.evaluate_frame([frame_touch])
    assert res_touch["hand_to_ear_flag"]
    assert res_touch["violation_flagged"]


def test_liveness_plr_rppg_synchrony():
    evaluator = LivenessAgentEvaluator()

    plr_res = evaluator.evaluate_plr_kinetics(baseline_diameter=4.5, stimulus_diameters=[3.4, 3.6, 3.5])
    assert plr_res["plr_valid"]
    assert 0.15 <= plr_res["constriction_ratio"] <= 0.35

    sample_rate = 30.0
    rppg_signal = [math.sin(2.0 * math.pi * 1.2 * (t / sample_rate)) + 0.02 * math.cos(0.5 * t) for t in range(300)]
    rppg_res = evaluator.evaluate_rppg_pulse(rppg_signal, sample_rate)
    assert rppg_res["rppg_valid"]
    assert 70.0 <= rppg_res["estimated_bpm"] <= 74.0


def test_liveness_plr_anticipation_detection():
    evaluator = LivenessAgentEvaluator()

    stimulus_ts = [2.0]
    diameter_ts = [0.0, 1.0, 1.5, 1.8, 2.5, 3.0]
    diameters = [5.0, 5.0, 4.2, 3.8, 3.5, 3.5]

    res = evaluator.evaluate_plr_kinetics(
        baseline_diameter=5.0, stimulus_diameters=diameters,
        stimulus_timestamps_s=stimulus_ts, diameter_timestamps_s=diameter_ts,
    )
    assert res["plr_anticipation_flagged"]
    assert not res["plr_valid"]


def test_liveness_motion_artifact_rejection():
    evaluator = LivenessAgentEvaluator(motion_artifact_threshold=0.10)
    sample_rate = 30.0

    rppg_signal = [math.sin(2.0 * math.pi * 1.2 * (t / sample_rate)) for t in range(200)]
    high_motion = [0.25] * 200

    res = evaluator.evaluate_rppg_pulse(
        rppg_signal, sample_rate, face_roi_motion=high_motion
    )
    assert res["motion_artifact_flagged"]
    assert not res["rppg_valid"]


def test_liveness_skin_tone_adjustment():
    evaluator = LivenessAgentEvaluator(min_rppg_snr_db=4.5)
    sample_rate = 30.0

    rppg_signal = [math.sin(2.0 * math.pi * 1.2 * (t / sample_rate)) + 0.1 * (t / 300) for t in range(300)]

    res_light = evaluator.evaluate_rppg_pulse(rppg_signal, sample_rate, skin_tone_factor=1.0)
    res_dark = evaluator.evaluate_rppg_pulse(rppg_signal, sample_rate, skin_tone_factor=0.4)

    assert res_light["snr_db_adjusted"] >= res_light["snr_db"]
    assert res_dark["snr_db_adjusted"] < res_light["snr_db_adjusted"]


def test_deepfake_cast_lip_sync():
    evaluator = DeepfakeAgentEvaluator()

    mouth_vel = [0.1, 0.5, 0.8, 0.3, 0.0, 0.6, 0.9, 0.2, 0.1, 0.5, 0.8, 0.3, 0.0, 0.6, 0.9, 0.2]
    audio_energy = [0.12, 0.48, 0.82, 0.29, 0.02, 0.58, 0.88, 0.18, 0.12, 0.48, 0.82, 0.29, 0.02, 0.58, 0.88, 0.18]
    sync_res = evaluator.evaluate_lip_synchronization(mouth_vel, audio_energy)
    assert sync_res["lip_sync_valid"]
    assert sync_res["peak_correlation"] > 0.85

    audio_desync = [0.9, 0.0, 0.0, 0.9, 0.8, 0.0, 0.0, 0.9]
    desync_res = evaluator.evaluate_lip_synchronization(mouth_vel, audio_desync)
    assert not desync_res["lip_sync_valid"]


def test_deepfake_gend_integration():
    evaluator = DeepfakeAgentEvaluator(gend_auroc_threshold=0.75)

    res_authentic = evaluator.evaluate_gend_deepfake(gend_score=0.92)
    assert not res_authentic["deepfake_flagged"]
    assert res_authentic["model"] == "GenD_CLIP_L_14"

    res_fake = evaluator.evaluate_gend_deepfake(gend_score=0.31)
    assert res_fake["deepfake_flagged"]

    res_embedding = evaluator.evaluate_gend_deepfake(clip_embedding=[0.1] * 768)
    assert res_embedding["gend_score"] is None


def test_deepfake_challenge_response():
    evaluator = DeepfakeAgentEvaluator()

    res_pass = evaluator.evaluate_challenge_response(
        challenge_issued="blink twice",
        expected_response="blink twice",
        actual_response="blink twice",
        response_latency_s=1.5,
    )
    assert res_pass["challenge_passed"]

    res_fail = evaluator.evaluate_challenge_response(
        challenge_issued="look left",
        expected_response="look left",
        actual_response="look right",
        response_latency_s=7.0,
    )
    assert not res_fail["challenge_passed"]


def test_five_channel_fusion_evaluator():
    evaluator = FusionAgentEvaluator(termination_threshold=0.65)

    authentic_scores = BehavioralChannelScores(
        gaze_risk=0.05,
        baseline_risk=0.10,
        kinematic_risk=0.0,
        liveness_risk=0.0,
        deepfake_risk=0.02,
    )
    res_auth = evaluator.evaluate_session(authentic_scores)
    assert not res_auth["session_terminated"]
    assert res_auth["integrity_posterior"] > 0.90

    fraud_scores = BehavioralChannelScores(
        gaze_risk=0.85,
        baseline_risk=0.90,
        kinematic_risk=0.70,
        liveness_risk=0.95,
        deepfake_risk=0.90,
    )
    res_fraud = evaluator.evaluate_session(fraud_scores)
    assert res_fraud["session_terminated"]
    assert res_fraud["composite_risk_score"] >= 0.65


def test_fusion_n3_rule():
    evaluator = FusionAgentEvaluator(n_required_channels=3)

    three_channel_flag = BehavioralChannelScores(
        gaze_risk=0.50,
        baseline_risk=0.10,
        kinematic_risk=0.45,
        liveness_risk=0.55,
        deepfake_risk=0.05,
    )
    res = evaluator.evaluate_session(three_channel_flag)
    assert res["flagged_channel_count"] >= 3
    assert res["n_rule_violation"]

    only_two_flag = BehavioralChannelScores(
        gaze_risk=0.50,
        baseline_risk=0.10,
        kinematic_risk=0.10,
        liveness_risk=0.55,
        deepfake_risk=0.05,
    )
    res2 = evaluator.evaluate_session(only_two_flag)
    assert res2["flagged_channel_count"] == 2
    assert not res2["n_rule_violation"]


def test_fusion_temporal_accumulation():
    evaluator = FusionAgentEvaluator(temporal_accumulation_windows=3)

    low_scores = BehavioralChannelScores(gaze_risk=0.1, baseline_risk=0.1, kinematic_risk=0.1, liveness_risk=0.1, deepfake_risk=0.1)
    r1 = evaluator.evaluate_session(low_scores, window_timestamp_s=0.0)
    assert r1["temporal_accumulated_risk"] <= 0.15

    high_scores = BehavioralChannelScores(gaze_risk=0.8, baseline_risk=0.8, kinematic_risk=0.8, liveness_risk=0.8, deepfake_risk=0.8)
    r2 = evaluator.evaluate_session(high_scores, window_timestamp_s=10.0)
    assert r2["temporal_windows_evaluated"] == 2

    evaluator.reset_temporal_history()
    assert len(evaluator._temporal_history) == 0


def test_fusion_viproctor_stub():
    evaluator = FusionAgentEvaluator()
    res = evaluator.evaluate_session_viproctor([], [], [])
    assert not res["viProctor_enabled"]
    assert not res["viProctor_available"]


def test_ks_test_consolidated():
    from agents.ks_test import kolmogorov_smirnov_2samp, evaluate_baseline_divergence

    d, p = kolmogorov_smirnov_2samp([1, 2, 3], [1, 2, 3])
    assert d < 0.3

    d2, p2 = kolmogorov_smirnov_2samp([1, 2, 3], [100, 200, 300])
    assert d2 > 0.5

    result = evaluate_baseline_divergence([1, 2, 3], [100, 200, 300], threshold=0.3)
    assert result is not None
