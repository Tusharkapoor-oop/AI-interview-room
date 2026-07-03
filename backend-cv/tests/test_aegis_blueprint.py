"""
AEGIS Research Institute — Next-Generation Backend AI Evaluation Blueprint
Empirical Test Suite: Verifies mathematical bounds and false-positive limits across all 5 modules.
Strict Rule Compliance: [ZERO-COMPROMISE-1] — Pure backend statistical test suite.
"""

import math
import pytest
from agents.gaze_agent import GazeAgentEvaluator, GazeFixationPoint
from agents.baseline_agent import BaselineAgentEvaluator
from agents.kinematic_agent import KinematicAgentEvaluator, SkeletalFrame, Keypoint3D
from agents.liveness_agent import LivenessAgentEvaluator
from agents.deepfake_agent import DeepfakeAgentEvaluator
from agents.fusion_agent import FusionAgentEvaluator, BehavioralChannelScores


def test_gaze_whitespace_fixation_clustering():
    evaluator = GazeAgentEvaluator()

    # 1. Authentic gaze points falling inside active regions
    legit_points = [
        GazeFixationPoint(timestamp_s=0.1 * i, x=0.3, y=0.5, duration_ms=200.0)
        for i in range(10)
    ]
    res_legit = evaluator.evaluate_fixation_stream(legit_points)
    assert not res_legit["violation_flagged"]
    assert res_legit["suspicious_clusters_detected"] == 0

    # 2. Suspicious clustering in whitespace corner (top-left outside active bounding boxes)
    suspicious_points = [
        GazeFixationPoint(timestamp_s=0.1 * i, x=0.01, y=0.01, duration_ms=250.0)
        for i in range(10)
    ]
    res_suspicious = evaluator.evaluate_fixation_stream(suspicious_points)
    assert res_suspicious["violation_flagged"]
    assert res_suspicious["suspicious_clusters_detected"] == 1


def test_baseline_ks_test_divergence():
    evaluator = BaselineAgentEvaluator(significance_alpha=0.01, critical_d_threshold=0.35)

    # Identical distributions should yield low D and high p-value
    baseline_yaw = [0.05, 0.04, 0.06, 0.05, 0.03, 0.07, 0.05, 0.04]
    live_yaw_normal = [0.05, 0.06, 0.04, 0.05, 0.05, 0.03, 0.06, 0.05]

    eval_normal = evaluator.evaluate_metric_divergence("yaw", baseline_yaw, live_yaw_normal)
    assert not eval_normal["divergence_detected"]
    assert eval_normal["ks_d_statistic"] < 0.35

    # Divergent distribution (candidate head yaw shifted extremely to look at side screen)
    live_yaw_shifted = [0.85, 0.88, 0.90, 0.86, 0.89, 0.87, 0.91, 0.85]
    eval_shifted = evaluator.evaluate_metric_divergence("yaw", baseline_yaw, live_yaw_shifted)
    assert eval_shifted["divergence_detected"]
    assert eval_shifted["ks_d_statistic"] >= 0.35


def test_kinematic_skeletal_anomalies():
    evaluator = KinematicAgentEvaluator()

    # Normal posture
    normal_kps = [
        Keypoint3D(index=KinematicAgentEvaluator.LEFT_WRIST, x=0.3, y=0.7, z=0.0),
        Keypoint3D(index=KinematicAgentEvaluator.LEFT_EAR, x=0.45, y=0.2, z=0.0),
    ]
    frame_normal = SkeletalFrame(0.1, normal_kps)
    res_normal = evaluator.evaluate_frame([frame_normal])
    assert not res_normal["violation_flagged"]

    # Hand-to-ear touch anomaly (earpiece insertion check)
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

    # Valid PLR response
    plr_res = evaluator.evaluate_plr_kinetics(baseline_diameter=4.5, stimulus_diameters=[3.4, 3.6, 3.5])
    assert plr_res["plr_valid"]
    assert 0.15 <= plr_res["constriction_ratio"] <= 0.35

    # Valid simulated 72 BPM cardiac rPPG signal (1.2 Hz sine wave at 30 Hz sample rate over 300 samples)
    sample_rate = 30.0
    rppg_signal = [math.sin(2.0 * math.pi * 1.2 * (t / sample_rate)) + 0.02 * math.cos(0.5 * t) for t in range(300)]
    rppg_res = evaluator.evaluate_rppg_pulse(rppg_signal, sample_rate)
    assert rppg_res["rppg_valid"]
    assert 70.0 <= rppg_res["estimated_bpm"] <= 74.0


def test_deepfake_cast_lip_sync():
    evaluator = DeepfakeAgentEvaluator()

    # Synchronized mouth velocity and audio energy over 16 frames
    mouth_vel = [0.1, 0.5, 0.8, 0.3, 0.0, 0.6, 0.9, 0.2, 0.1, 0.5, 0.8, 0.3, 0.0, 0.6, 0.9, 0.2]
    audio_energy = [0.12, 0.48, 0.82, 0.29, 0.02, 0.58, 0.88, 0.18, 0.12, 0.48, 0.82, 0.29, 0.02, 0.58, 0.88, 0.18]
    sync_res = evaluator.evaluate_lip_synchronization(mouth_vel, audio_energy)
    assert sync_res["lip_sync_valid"]
    assert sync_res["peak_correlation"] > 0.85

    # Completely out-of-sync or anti-correlated signal
    audio_desync = [0.9, 0.0, 0.0, 0.9, 0.8, 0.0, 0.0, 0.9]
    desync_res = evaluator.evaluate_lip_synchronization(mouth_vel, audio_desync)
    assert not desync_res["lip_sync_valid"]


def test_five_channel_fusion_evaluator():
    evaluator = FusionAgentEvaluator(termination_threshold=0.65)

    # Authentic candidate scores
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

    # Fraudulent proxy / deepfake injection candidate
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
