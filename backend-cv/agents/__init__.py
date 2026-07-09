"""
agents/__init__.py
Aegis Multi-Agent Orchestration Package
Hub-Spoke pattern: Aria (Hub) + specialist spoke agents
"""
from .circuit_breaker import AgentCircuitBreaker
from .hub import AegisHub
from .cv_agent import CVAgent
from .code_review_agent import CodeReviewAgent
from .bias_agent import BiasAuditAgent
from .memory_agent import MemoryAgent
from .audio_agent import AudioAgent
from .fraud_agent import FraudAgent
from .continuous_verifier import ContinuousVerifier
from .security_engine import (
    GestureRecognitionEngine,
    HybridGazeTracker,
    KSAnomalyDetector,
    LivenessVerifier,
)

from .forensic_engine import KSTestBaselineEngine, WhitespaceFixationDetector, PLRrPPGLivenessEngine, KinematicGazeLivenessEngine, ForensicObservation

from .gaze_agent import GazeAgentEvaluator
from .baseline_agent import BaselineAgentEvaluator
from .kinematic_agent import KinematicAgentEvaluator
from .liveness_agent import LivenessAgentEvaluator
from .deepfake_agent import DeepfakeAgentEvaluator
from .fusion_agent import FusionAgentEvaluator
from .ks_test import evaluate_baseline_divergence
from .fusion import FusionEngine, CANONICAL_FUSION_WEIGHTS

__all__ = [
    "AgentCircuitBreaker",
    "AegisHub",
    "CVAgent",
    "CodeReviewAgent",
    "BiasAuditAgent",
    "MemoryAgent",
    "AudioAgent",
    "FraudAgent",
    "ContinuousVerifier",
    "GestureRecognitionEngine",
    "HybridGazeTracker",
    "KSAnomalyDetector",
    "LivenessVerifier",
    "KSTestBaselineEngine",
    "WhitespaceFixationDetector",
    "PLRrPPGLivenessEngine",
    "KinematicGazeLivenessEngine",
    "ForensicObservation",
    "GazeAgentEvaluator",
    "BaselineAgentEvaluator",
    "KinematicAgentEvaluator",
    "LivenessAgentEvaluator",
    "DeepfakeAgentEvaluator",
    "FusionAgentEvaluator",
    "evaluate_baseline_divergence",
    "FusionEngine",
    "CANONICAL_FUSION_WEIGHTS",
]
