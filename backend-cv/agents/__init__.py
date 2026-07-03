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

from .gaze_agent import GazeAgentEvaluator
from .baseline_agent import BaselineAgentEvaluator
from .kinematic_agent import KinematicAgentEvaluator
from .liveness_agent import LivenessAgentEvaluator
from .deepfake_agent import DeepfakeAgentEvaluator
from .fusion_agent import FusionAgentEvaluator

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
    "GazeAgentEvaluator",
    "BaselineAgentEvaluator",
    "KinematicAgentEvaluator",
    "LivenessAgentEvaluator",
    "DeepfakeAgentEvaluator",
    "FusionAgentEvaluator",
]
