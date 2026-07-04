"""
agents/__init__.py
Aegis Multi-Agent Orchestration Package
Hub-Spoke pattern: Aria (Hub) + specialist spoke agents
"""
from .hub import AegisHub
from .cv_agent import CVAgent
from .code_review_agent import CodeReviewAgent
from .bias_agent import BiasAuditAgent
from .memory_agent import MemoryAgent
from .audio_agent import AudioAgent
from .fraud_agent import FraudAgent
from .continuous_verifier import ContinuousVerifier
from .security_engine import (
    FiveChannelFusionEngine,
    GestureRecognitionEngine,
    HybridGazeTracker,
    KSAnomalyDetector,
    LivenessVerifier,
)

from .forensic_engine import KSTestBaselineEngine, WhitespaceFixationDetector, PLRrPPGLivenessEngine, ForensicObservation
from .fusion_engine import KinematicGestureEngine, ChannelPacket
from .gaze_agent import GazeAgentEvaluator
from .baseline_agent import BaselineAgentEvaluator
from .kinematic_agent import KinematicAgentEvaluator
from .liveness_agent import LivenessAgentEvaluator
from .deepfake_agent import DeepfakeAgentEvaluator
from .fusion_agent import FusionAgentEvaluator
from .ks_test import evaluate_baseline_divergence as ks_test, kolmogorov_smirnov_test
from .fusion import FusionEngine, CANONICAL_FUSION_WEIGHTS

__all__ = [
    "AegisHub",
    "CVAgent",
    "CodeReviewAgent",
    "BiasAuditAgent",
    "MemoryAgent",
    "AudioAgent",
    "FraudAgent",
    "ContinuousVerifier",
    "FiveChannelFusionEngine",
    "GestureRecognitionEngine",
    "HybridGazeTracker",
    "KSAnomalyDetector",
    "LivenessVerifier",
    "KSTestBaselineEngine",
    "WhitespaceFixationDetector",
    "PLRrPPGLivenessEngine",
    "ForensicObservation",
    "KinematicGestureEngine",
    "ChannelPacket",
    "GazeAgentEvaluator",
    "BaselineAgentEvaluator",
    "KinematicAgentEvaluator",
    "LivenessAgentEvaluator",
    "DeepfakeAgentEvaluator",
    "FusionAgentEvaluator",
    "ks_test",
    "kolmogorov_smirnov_test",
    "FusionEngine",
    "CANONICAL_FUSION_WEIGHTS",
]
