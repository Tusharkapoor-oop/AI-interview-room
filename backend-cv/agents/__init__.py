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

__all__ = [
    "AegisHub",
    "CVAgent",
    "CodeReviewAgent",
    "BiasAuditAgent",
    "MemoryAgent",
    "AudioAgent",
    "FraudAgent",
    "ContinuousVerifier",
]
