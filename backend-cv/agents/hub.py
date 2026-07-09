"""
agents/hub.py — AegisHub: Hub Orchestrator
The central Hub in the Hub-Spoke multi-agent architecture.
Aria is the Hub — she owns the conversation and coordinates all spoke agents.

ReAct Reasoning Loop per turn:
  Thought: analyze candidate message, CV data, memory context
  Action:  invoke BiasAuditAgent → check question safety
           invoke MemoryAgent   → enrich context if needed
           call GPT-4o          → generate response
  Obs:     parse response, optionally invoke CodeReviewAgent if code present
  Reply:   send final response to candidate via WebSocket

Architecture notes:
  - Hub owns all state (conversation history, risk events, integrity score)
  - Spokes are stateless workers called on-demand
  - All inter-agent messages are typed dataclasses (Pydantic-level safety)
  - HITL gates are broadcast to recruiter WebSocket for approval
"""
import asyncio
import json
import logging
import random
import re
from collections import deque
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Optional
import time as _time

from .bias_agent import BiasAuditAgent
from .circuit_breaker import AgentCircuitBreaker
from .utils import compute_integrity_score
from .code_review_agent import CodeReviewAgent
from .cv_agent import CVAgent, RiskEvent
from .memory_agent import MemoryAgent
from .audio_agent import AudioAgent
from .fraud_agent import FraudAgent
from .continuous_verifier import ContinuousVerifier
from .security_engine import (
    GestureRecognitionEngine,
    HybridGazeTracker,
    LivenessVerifier,
)
from .deepfake_agent import DeepfakeAgentEvaluator
from .kinematic_agent import KinematicAgentEvaluator
from .baseline_agent import BaselineAgentEvaluator
from .gend_service import GenDService
from .emotion_agent import EmotionSecurityClassifier
from .gaze_agent import GazeAgentEvaluator
from .fusion import FusionEngine

log = logging.getLogger("aegis.hub")

# ── Prompt injection detection patterns (C-3) ────────────────────────────────
INJECTION_PATTERNS = [
    r"ignore\s+all\s+(previous|prior)\s+(instructions|directions|rules|prompts)",
    r"system\s+prompt",
    r"you\s+are\s+(not|now)\s+(an?\s+)?(ai|assistant|chatbot|gpt|llm)",
    r"forget\s+(everything|all\s+previous|all\s+prior)",
    r"new\s+(instructions|directive|command|prompt|rule)",
    r"override\s+(all\s+)?(instructions|directives|rules)",
    r"print\s+(your\s+)?(system\s+)?prompt",
    r"reveal\s+(your\s+)?(system\s+)?prompt",
    r"DAN\b|do\s+anything\s+now",
    r"act\s+as\s+(if\s+you\s+are|an?\s+)?(human|real\s+person|unrestricted)",
]


def _detect_injection(text: str) -> list[str]:
    """Scan text for prompt injection patterns. Returns list of matched patterns."""
    matches = []
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            matches.append(pattern)
    return matches

# ── Hub system prompt ─────────────────────────────────────────────────────────
ARIA_SYSTEM = """You are Aria, the AI interviewer for Aegis Interview Room — the world's most advanced \
fair-hiring platform. You conduct structured technical interviews.

Core personality: warm, intellectually sharp, empathetic. You make candidates feel respected and heard.
You are honest about the fact that the session is being proctored by an AI system.

{memory_block}

Rules:
- Always reply in the candidate's chosen language ({language}).
- Ask ONE focused technical follow-up per turn (max 3 sentences total).
- Assess problem-solving reasoning, communication quality, and technical depth.
- If candidate submits code: affirm you'll have it reviewed and pivot to asking about their thought process.
- NEVER give away answers. Use Socratic questioning to guide thinking.
- If the candidate seems stressed, acknowledge it warmly before continuing.
- You have access to the candidate's integrity context but NEVER mention it to them."""

class AegisHub:
    """
    Hub orchestrator. One instance per WebSocket session.
    Owns all session state and coordinates spokes.
    """

    SCORE_HITL_THRESHOLD = 40    # Below this → broadcast HITL alert to recruiter

    def __init__(
        self,
        session_id: str,
        candidate_id: str = None,
        language: str = "en",
        job_role: str = "software_engineer",
        ai_client=None,
        db_session=None,
        recruiter_broadcast=None,    # async callable → sends HITL events to recruiter WS
        candidate_broadcast=None,    # async callable → sends events to candidate WS (P1-9)
        event_batcher=None,          # EventBatcher for batch DB writes (P1-7)
    ):
        self.session_id       = session_id
        self.candidate_id     = candidate_id
        self.language         = language
        self.job_role         = job_role
        self.ai_client        = ai_client
        self.db_session       = db_session
        self._broadcast       = recruiter_broadcast
        self._candidate_ws    = candidate_broadcast
        self._event_batcher   = event_batcher

        # In-context memory (Tier 1)
        self._history: deque = deque(maxlen=200)
        self._risk_events: list[RiskEvent] = []

        # Agent status tracking (broadcast to frontend)
        self._agent_statuses = {
            "aria":         "idle",
            "cv_agent":     "idle",
            "code_review":  "idle",
            "bias_agent":   "idle",
            "memory_agent": "idle",
            "audio_agent":  "idle",
            "fraud_agent":  "idle",
        }

        # Initialize spoke agents
        self.cv_agent          = CVAgent(session_id=session_id)
        self.bias_agent        = BiasAuditAgent(ai_client=ai_client)
        self.code_review_agent = CodeReviewAgent(session_id=session_id, ai_client=ai_client)
        self.memory_agent      = MemoryAgent(
            session_id   = session_id,
            candidate_id = candidate_id,
            db_session   = db_session,
            ai_client    = ai_client,
        )
        self.audio_agent       = AudioAgent(session_id=session_id)
        self.fraud_agent       = FraudAgent(session_id=session_id)
        self.continuous_verifier = ContinuousVerifier(session_id=session_id)
        self.gaze_tracker = HybridGazeTracker()
        self.gesture_engine = GestureRecognitionEngine()
        self.liveness_verifier = LivenessVerifier()
        self.fusion_engine = FusionEngine()
        self.circuit_breaker = AgentCircuitBreaker()
        self._accommodation_mode = False
        # Wired dead-code agents (P1-12)
        self.gend_service = GenDService(force_heuristic=True)
        self.deepfake_evaluator = DeepfakeAgentEvaluator(gend_service=self.gend_service)
        self.kinematic_evaluator = KinematicAgentEvaluator()
        self.baseline_evaluator = BaselineAgentEvaluator()

        self.gaze_evaluator = GazeAgentEvaluator()
        self.emotion_classifier = EmotionSecurityClassifier()

        # Trajectory/keystroke metadata
        self.response_latencies = []
        self.keystroke_profile_data = None

        # KS baseline buffer — collects real gaze data for baseline calibration
        self._gaze_baseline_buffer_x: list[float] = []
        self._gaze_baseline_buffer_y: list[float] = []
        self._gaze_live_buffer_x: list[float] = []
        self._gaze_live_buffer_y: list[float] = []
        self._baseline_fitted = False

        # Emotion & audio/video dynamics buffers
        self._pupil_buffer: list[float] = []
        self._heart_rate_buffer: list[float] = []
        self._eye_openness_buffer: list[float] = []
        self._mouth_velocity_buffer: list[float] = []
        self._audio_energy_buffer: list[float] = []
        self._last_mouth_open: float = 0.0

        # Load memory at start (Tiers 2+3+4)
        self._memory_ctx = self.memory_agent.retrieve(job_role=job_role)
        self._agent_statuses["memory_agent"] = "ready"

        log.info("[Hub] Session %s initialized — spoke agents ready", session_id)

    def _update_status(self, agent: str, status: str):
        self._agent_statuses[agent] = status

    async def _maybe_hitl(self, score: int):
        """Broadcast HITL escalation to recruiter if score drops below threshold."""
        if score <= self.SCORE_HITL_THRESHOLD and self._broadcast:
            payload = {
                "type":    "HITL_ESCALATION",
                "score":   score,
                "session": self.session_id,
                "message": f"Integrity score dropped to {score}. Action required.",
                "options": ["CONTINUE", "WARN_CANDIDATE", "TERMINATE"],
                "expires": 30,
            }
            await self._broadcast(payload)
            # P1-9: Send sanitized transparency update to candidate (no options)
            if self._candidate_ws:
                await self._candidate_ws({
                    "type": "integrity_update",
                    "data": {
                        "type": "integrity_notice",
                        "score": score,
                        "message": "Your session integrity score has decreased. A reviewer has been notified.",
                    },
                })
            log.warning("[Hub] HITL escalation sent — score=%d", score)

    async def ingest_cv(self, inference: dict) -> Optional[RiskEvent]:
        """
        Hub → CVAgent: process one frame's inference.
        Returns a RiskEvent if anomaly crossed the grace threshold.
        Also computes updated integrity score and triggers HITL if needed.
        """
        self._update_status("cv_agent", "processing")
        event = self.cv_agent.process(inference)

        if event:
            self._risk_events.append(event)
            self.fraud_agent.ingest_event({
                "event_type": event.event_type,
                "severity": event.severity,
                "timestamp": event.timestamp,
                "fraud_signal": event.fraud_signal
            })
            score = compute_integrity_score(self._risk_events)
            await self._maybe_hitl(score)
            log.info("[Hub] Risk event logged — %s %s (score=%d)", event.severity, event.event_type, score)

        self._update_status("cv_agent", "monitoring")
        return event

    def _flag_security_event(self, risk_event: RiskEvent):
        """Sync helper: append a RiskEvent to the risk event list and feed fraud agent."""
        self._risk_events.append(risk_event)
        self.fraud_agent.ingest_event({
            "event_type": risk_event.event_type,
            "severity": risk_event.severity,
            "timestamp": risk_event.timestamp.isoformat() if hasattr(risk_event.timestamp, 'isoformat') else str(risk_event.timestamp),
            "fraud_signal": risk_event.fraud_signal,
        })

    async def ingest_security_features(self, inference: dict) -> Optional[dict]:
        """Run the new security engine over the frame-level telemetry.
        When accommodation mode is active, gaze/micro-expression tracking is bypassed."""
        try:
            pose_dict = inference.get("pose") or inference.get("head_pose") or {}
            if not isinstance(pose_dict, dict):
                pose_dict = {}
            pitch_val = float(pose_dict.get("pitch", 0.0) or 0.0)
            yaw_val = float(pose_dict.get("yaw", 0.0) or 0.0)

            if self._accommodation_mode:
                return {
                    "gaze_estimate": {"screen_x": 0.5, "screen_y": 0.5},
                    "gesture_event": None,
                    "liveness": {"is_live": True},
                    "fusion": {"composite_risk_score": 0.0, "session_terminated": False},
                    "windowed": {"session_terminated": False},
                    "accumulated": {"temporal_accumulated_risk": 0.0},
                    "deepfake": {"risk_score": 0.0},
                    "kinematic": {"risk_score": 0.0},
                    "baseline_divergence": None,
                    "in_active_ui": True,
                    "accommodation_mode": True,
                }

            gaze_estimate = self.gaze_tracker.update_gaze(
                pitch=pitch_val,
                yaw=yaw_val,
                nose_x=float(inference.get("nose_x", 0.5) or 0.5),
                nose_y=float(inference.get("nose_y", 0.5) or 0.5),
                depth=float(inference.get("depth", 0.6) or 0.6),
            )
            gesture_event = self.gesture_engine.update_frame(
                left_wrist=inference.get("left_wrist"),
                right_wrist=inference.get("right_wrist"),
                head_pitch=pitch_val,
                head_yaw=yaw_val,
                face_count=int(inference.get("face_count", 1) or 1),
            )
            pupil_latency = inference.get("pupil_response_latency_ms")
            bpm_val = inference.get("bpm")
            signal_q = inference.get("signal_quality")
            if pupil_latency is None or bpm_val is None or signal_q is None:
                log.warning("[Hub] LivenessVerifier using stub defaults — no real PLR/rPPG data in inference dict")
            liveness = self.liveness_verifier.evaluate(
                pupil_response_latency_ms=float(pupil_latency) if pupil_latency is not None else float(inference.get("pupil_diameter_mm", 180.0) or 180.0),
                bpm=float(bpm_val) if bpm_val is not None else 78.0,
                signal_quality=float(signal_q) if signal_q is not None else 0.9,
            )

            if not self._baseline_fitted:
                self._gaze_baseline_buffer_x.append(gaze_estimate["screen_x"])
                self._gaze_baseline_buffer_y.append(gaze_estimate["screen_y"])
                if len(self._gaze_baseline_buffer_x) >= 30:
                    self._baseline_fitted = True
                    log.info("[Hub] KS baseline collected — %d samples (x+y)", len(self._gaze_baseline_buffer_x) + len(self._gaze_baseline_buffer_y))
            baseline_div = None
            if self._baseline_fitted:
                self._gaze_live_buffer_x.append(gaze_estimate["screen_x"])
                self._gaze_live_buffer_y.append(gaze_estimate["screen_y"])
                if len(self._gaze_live_buffer_x) > 60:
                    self._gaze_live_buffer_x.pop(0)
                    self._gaze_live_buffer_y.pop(0)
                baseline_div = self.baseline_evaluator.evaluate_session_profile(
                    {"screen_x": list(self._gaze_baseline_buffer_x), "screen_y": list(self._gaze_baseline_buffer_y)},
                    {"screen_x": list(self._gaze_live_buffer_x), "screen_y": list(self._gaze_live_buffer_y)}
                )

            # P1-12 & R-11: Wire deepfake + kinematic evaluators with temporal alignment
            curr_mouth_open = float(inference.get("mouth_open", 0.0) or 0.0)
            mouth_vel = abs(curr_mouth_open - self._last_mouth_open) * 30.0
            self._last_mouth_open = curr_mouth_open
            self._mouth_velocity_buffer.append(mouth_vel)
            audio_e = float(inference.get("audio_energy", inference.get("audio_rms", 0.0)) or 0.0)
            self._audio_energy_buffer.append(audio_e)
            if len(self._mouth_velocity_buffer) > 60:
                self._mouth_velocity_buffer.pop(0)
                self._audio_energy_buffer.pop(0)

            mouth_vels = inference.get("mouth_velocities") or self._mouth_velocity_buffer
            audio_ens = inference.get("audio_energies") or self._audio_energy_buffer

            deepfake_risk = self.deepfake_evaluator.evaluate_stream(
                mouth_velocities=mouth_vels,
                audio_energies=audio_ens,
                spectral_artifact_scores=inference.get("spectral_artifact_scores") or [],
            )
            if inference.get("skeletons") is None:
                log.warning("[Hub] KinematicEvaluator using empty skeletons — no skeleton data in inference dict")
            kinematic_result = self.kinematic_evaluator.evaluate_frame(
                skeletons=inference.get("skeletons") or []
            )

            # ContinuousVerifier: periodic liveness schedule + face telemetry
            face_detected = bool(inference.get("face_detected", False))
            liveness_event = self.continuous_verifier.check_liveness_schedule()
            if liveness_event:
                log.info("[Hub] %s — %s", liveness_event.event_type, liveness_event.description)
            face_event = self.continuous_verifier.process_face_telemetry(
                face_detected=face_detected,
                pose=pose_dict,
            )
            if face_event:
                log.warning("[Hub] %s — %s", face_event.event_type, face_event.description)

            face_embedding = inference.get("face_embedding") or []
            if face_embedding:
                embed_event = self.continuous_verifier.verify_face_embedding_consistency(face_embedding)
                if embed_event:
                    log.warning("[Hub] %s — %s", embed_event.event_type, embed_event.description)

            audio_rms_val = float(inference.get("audio_energy", inference.get("audio_rms", 0.0)) or 0.0)
            speaking_val = bool(inference.get("candidate_speaking", False) or inference.get("mouth_open", 0) > 0.3)
            voice_event = self.continuous_verifier.verify_voice_consistency(
                current_audio_rms=audio_rms_val,
                is_speaking=speaking_val,
            )
            if voice_event:
                log.warning("[Hub] %s — %s", voice_event.event_type, voice_event.description)

            # Gaze Fixation & Whitespace check (6th channel per AEGIS §11.1)
            in_active_ui = self.gaze_evaluator.is_in_active_region(gaze_estimate["screen_x"], gaze_estimate["screen_y"])
            whitespace_penalty = 0.8 if not in_active_ui else 0.1
            ks_violated = bool(baseline_div and (baseline_div.get("overall_violation") or baseline_div.get("divergence_detected")))
            ks_penalty = 0.7 if ks_violated else 0.1

            channel_risks = {
                "gaze": ks_penalty,
                "whitespace": whitespace_penalty,
                "baseline": 0.8 if ks_violated else 0.1,
                "kinematic": kinematic_result.get("risk_score", 0.0),
                "liveness": 0.8 if not liveness.get("is_live", True) else 0.1,
                "deepfake": deepfake_risk.get("risk_score", 0.0),
            }
            fusion = self.fusion_engine.evaluate(channel_risks)
            windowed = self.fusion_engine.evaluate_windowed(channel_risks)
            self.fusion_engine.add_temporal_window(channel_risks, _time.time())
            accumulated = self.fusion_engine.evaluate_accumulated()

            # Update emotion dynamics buffers
            self._pupil_buffer.append(float(inference.get("pupil_diameter_mm", 3.5) or 3.5))
            self._heart_rate_buffer.append(float(inference.get("bpm", 78.0) or 78.0))
            ear_val = inference.get("ear", 0.5)
            if isinstance(ear_val, dict):
                ear_val = ear_val.get("left", 0.5)
            self._eye_openness_buffer.append(float(ear_val or 0.5))
            if len(self._pupil_buffer) > 60:
                self._pupil_buffer.pop(0)
                self._heart_rate_buffer.pop(0)
                self._eye_openness_buffer.pop(0)

            # Emotion security classifier (EU AI Act Art. 5(1)(f) safety exception)
            emotion_result = self.emotion_classifier.classify(
                gaze_history_x=self._gaze_live_buffer_x or [gaze_estimate.get("screen_x", 0.5)],
                gaze_history_y=self._gaze_live_buffer_y or [gaze_estimate.get("screen_y", 0.5)],
                pupil_diameters=self._pupil_buffer,
                heart_rate_history=self._heart_rate_buffer,
                eye_openness_history=self._eye_openness_buffer,
                head_pose_variance=abs(pitch_val) + abs(yaw_val),
                face_detected=bool(inference.get("face_detected", False)),
            )
            if emotion_result["state"] in ("SPOOFING_ANOMALY", "STRESS") and emotion_result["confidence"] > 0.7:
                self._flag_security_event(
                    RiskEvent(
                        session_id=self.session_id,
                        event_type="EMOTION_SECURITY_FLAG",
                        severity="HIGH",
                        description=emotion_result["explanation"],
                        metadata={"emotion_state": emotion_result["state"], "confidence": emotion_result["confidence"]},
                    )
                )

            # === Check for security violations and feed into risk pipeline ===
            should_flag = (
                fusion.get("session_terminated", False)
                or windowed.get("session_terminated", False)
            )

            if should_flag:
                event_type_parts = []
                cr = fusion.get("composite_risk_score", 0.0)
                if cr >= 0.5:
                    sev = "CRITICAL" if cr >= 0.9 else "HIGH" if cr >= 0.7 else "MEDIUM"
                    event_type_parts.append(f"FUSION_{sev}")
                if windowed.get("n_rule_violation", False):
                    event_type_parts.append("N_PLUS_3_RULE")
                if fusion.get("session_terminated", False):
                    event_type_parts.append("SESSION_TERMINATED")

                event_type = "_".join(event_type_parts) if event_type_parts else "SECURITY_VIOLATION"
                sev_label = "CRITICAL" if cr >= 0.9 else "HIGH" if cr >= 0.7 else "MEDIUM"

                risk_event = RiskEvent(
                    session_id=self.session_id,
                    event_type=event_type,
                    severity=sev_label,
                    description=fusion.get("explanation", "Security engine flagged anomaly"),
                    confidence=1.0 - cr,
                    pose={},
                    gaze_quadrant="CENTER",
                    fraud_signal=True,
                )
                self._flag_security_event(risk_event)
                log.info("[Hub] Security violation flagged — %s %s", sev_label, event_type)

            return {
                "gaze_estimate": gaze_estimate,
                "gesture_event": asdict(gesture_event) if gesture_event else None,
                "liveness": liveness,
                "fusion": fusion,
                "windowed": windowed,
                "accumulated": accumulated,
                "deepfake": deepfake_risk,
                "kinematic": kinematic_result,
                "baseline_divergence": baseline_div,
                "in_active_ui": in_active_ui,
                "emotion_analysis": {
                    "state": emotion_result["state"],
                    "confidence": emotion_result["confidence"],
                    "confidence_95_ci": emotion_result["confidence_95_ci"],
                    "all_probs": emotion_result["all_probs"],
                    "explanation": emotion_result["explanation"],
                },
            }
        except Exception as exc:
            log.error("[Hub] security engine failed: %s", exc, exc_info=True)
            return {"error": str(exc)}

    async def ingest_digital_event(self, event_data: dict) -> Optional[RiskEvent]:
        """Ingest a digital security event from the frontend."""
        self._update_status("fraud_agent", "processing")

        # Check if response latency anomaly, record it
        if event_data.get("type") == "RESPONSE_LATENCY_ANOMALY":
            desc = event_data.get("desc", "")
            match = re.search(r"(\d+)ms", desc)
            if match:
                self.response_latencies.append(float(match.group(1)))

        event = RiskEvent(
            session_id=self.session_id,
            event_type=event_data.get("type", "UNKNOWN"),
            severity=event_data.get("severity", "LOW"),
            description=event_data.get("desc", ""),
            confidence=float(event_data.get("confidence", 0.8)),
            pose={},
            gaze_quadrant="CENTER"
        )
        self._risk_events.append(event)

        # Write to DB TelemetryEvent (batched)
        if self._event_batcher:
            from database import TelemetryEvent
            db_event = TelemetryEvent(
                session_id=self.session_id,
                event_type=event.event_type,
                severity=event.severity,
                confidence=event.confidence,
                description=event.description
            )
            await self._event_batcher.add(db_event)

        # Ingest to FraudAgent
        self.fraud_agent.ingest_event({
            "event_type": event.event_type,
            "severity": event.severity,
            "timestamp": event.timestamp,
            "fraud_signal": True
        })

        score = compute_integrity_score(self._risk_events)
        await self._maybe_hitl(score)

        # Notify recruiter WS in real-time
        if self._broadcast:
            await self._broadcast({
                "type": "RISK_EVENT",
                "event": {
                    "event_type": event.event_type,
                    "severity": event.severity,
                    "description": event.description,
                    "ts": event.timestamp
                },
                "score": score
            })

        self._update_status("fraud_agent", "monitoring")
        return event

    async def ingest_audio_features(self, features: dict) -> Optional[RiskEvent]:
        """Ingest real-time audio features and process via AudioAgent spoke."""
        self._update_status("audio_agent", "processing")
        audio_event = self.audio_agent.process_segment(features)

        if audio_event:
            # Map AudioEvent to RiskEvent
            event = RiskEvent(
                session_id=self.session_id,
                event_type=audio_event.event_type,
                severity=audio_event.severity,
                description=audio_event.description,
                confidence=audio_event.confidence,
                pose={},
                gaze_quadrant="CENTER",
                fraud_signal=audio_event.fraud_signal
            )
            self._risk_events.append(event)

            # Write to DB TelemetryEvent (batched)
            if self._event_batcher:
                from database import TelemetryEvent
                db_event = TelemetryEvent(
                    session_id=self.session_id,
                    event_type=event.event_type,
                    severity=event.severity,
                    confidence=event.confidence,
                    description=event.description
                )
                await self._event_batcher.add(db_event)

            # Ingest to FraudAgent
            self.fraud_agent.ingest_event({
                "event_type": event.event_type,
                "severity": event.severity,
                "timestamp": event.timestamp,
                "fraud_signal": event.fraud_signal
            })

            score = compute_integrity_score(self._risk_events)
            await self._maybe_hitl(score)

            # Notify recruiter WS in real-time
            if self._broadcast:
                await self._broadcast({
                    "type": "RISK_EVENT",
                    "event": {
                        "event_type": event.event_type,
                        "severity": event.severity,
                        "description": event.description,
                        "ts": event.timestamp
                    },
                    "score": score
                })

            self._update_status("audio_agent", "monitoring")
            return event

        self._update_status("audio_agent", "monitoring")
        return None

    async def sync_keystroke_baseline(self, profile: dict):
        """Sync candidate's keystroke dynamic profile with backend."""
        self.keystroke_profile_data = profile

    async def think_and_respond(self, candidate_message: str) -> dict:
        """
        Hub's main ReAct loop per turn — parallel spoke agent dispatch.

        Runs bias audit, AI generation, and code review concurrently
        since all three are independent.
        """

        self._update_status("aria", "thinking")
        self._history.append({"role": "user", "content": candidate_message})

        has_code = "```" in candidate_message or candidate_message.strip().startswith("def ")
        memory_block = self._memory_ctx.to_prompt_block()
        system_prompt = ARIA_SYSTEM.format(memory_block=memory_block, language=self.language)
        messages = [{"role": "system", "content": system_prompt}] + list(self._history)

        current_score = self.integrity_score()
        if current_score < 70:
            critical_events = [e for e in self._risk_events if e.severity in ("HIGH", "CRITICAL")]
            if critical_events:
                reasons = ", ".join(list(set(e.event_type for e in critical_events))[:3])
                messages.append({
                    "role": "system",
                    "content": f"[BIOMETRIC RISK ESCALATION] The candidate's integrity score has dropped to {current_score}/100 due to: {reasons}. Do NOT ignore this! Ask a probing, direct question to verify if they are looking away, reading from notes, or receiving external assistance. Maintain professional composure while strictly verifying their authenticity."
                })

        last_ai = next(
            (m["content"] for m in reversed(self._history) if m["role"] == "assistant"),
            ""
        )
        question_context = next(
            (m["content"] for m in self._history if m["role"] == "system"),
            "General coding challenge"
        )

        # ── Parallel dispatch: bias audit, AI gen, code review ───────────
        self._update_status("bias_agent", "auditing")
        self._update_status("aria", "generating")
        if has_code:
            self._update_status("code_review", "reviewing")

        async def _gen_reply():
            if self.ai_client:
                try:
                    resp = await self.ai_client.chat.completions.create(
                        model="gpt-4o", messages=messages, max_tokens=220, temperature=0.72,
                    )
                    return resp.choices[0].message.content
                except Exception as e:
                    log.warning("[Hub] Aria AI call failed: %s", e)
                    return "That's a thoughtful response! Can you walk me through the specific trade-offs you weighed?"
            return random.choice([
                "That's an excellent point! What was the most complex technical decision in that work?",
                "Interesting approach. How did you validate the correctness of that solution?",
                "Walk me through how you'd scale that system to handle 100× the load.",
                "What would you do differently if you were starting that project today?",
            ])

        tasks = []
        if last_ai:
            tasks.append(self.circuit_breaker.call("bias_agent", lambda: self.bias_agent.audit(last_ai)))
        else:
            tasks.append(asyncio.sleep(0))

        tasks.append(_gen_reply())

        if has_code:
            tasks.append(self.circuit_breaker.call("code_review", lambda: self.code_review_agent.review(
                code=candidate_message, language="python", question=question_context,
            )))
        else:
            tasks.append(asyncio.sleep(0))

        results = await asyncio.gather(*tasks)

        audit = results[0] if last_ai else None
        reply_text = results[1]
        code_review = results[2] if has_code else None

        self._update_status("aria", "idle")
        self._update_status("bias_agent", "ready")
        self._history.append({"role": "assistant", "content": reply_text})

        # ── Post-dispatch: bias correction ─────────────────────────────────
        if audit and not audit.safe:
            log.warning("[Hub] BiasAgent blocked previous AI message: %s", audit.flags)
            self._history.append({
                "role": "system",
                "content": (
                    f"[INTERNAL COMPLIANCE CORRECTION] Your previous question was flagged for bias: "
                    f"{', '.join(audit.flags)}. "
                    f"Suggested replacement: {audit.suggestion}. "
                    f"Please ask a rephrased, compliant question instead."
                )
            })

        # ── Post-dispatch: code review ─────────────────────────────────────
        if has_code:
            self._update_status("code_review", "idle")
            if code_review:
                log.info("[Hub] Code review done — score=%d, correctness=%s",
                         code_review.score, code_review.correctness)
            else:
                log.warning("[Hub] Code review skipped (circuit breaker open or agent failed)")

            if code_review and code_review.cheating_flag and self._broadcast:
                await self._broadcast({
                    "type":    "HITL_CODE_PLAGIARISM",
                    "session": self.session_id,
                    "message": f"Plagiarism detected: {code_review.cheating_note}",
                    "options": ["IGNORE", "FLAG_FOR_REVIEW", "TERMINATE"],
                    "expires": 30,
                })

        return {
            "role":            "ai",
            "message":         reply_text,
            "agent_statuses":  dict(self._agent_statuses),
            "integrity_score": compute_integrity_score(self._risk_events),
            "code_review":     code_review.to_dict() if code_review else None,
            "timestamp":       datetime.now(timezone.utc).isoformat(),
        }

    def set_accommodation_mode(self, enabled: bool):
        """Disable gaze/micro-expression tracking for medical conditions.
        Falls back to identity + environment scan only."""
        self._accommodation_mode = enabled
        log.info("[Hub] Accommodation mode %s", "enabled" if enabled else "disabled")

    async def end_session(self):
        """Called when the WebSocket closes — writes episodic memory, finalizes artifacts."""
        log.info("[Hub] Ending session %s", self.session_id)

        session_duration = 0
        if self.db_session:
            from database import InterviewSession
            db_sess = self.db_session.query(InterviewSession).filter_by(id=self.session_id).first()
            if db_sess and db_sess.created_at:
                delta = datetime.now(timezone.utc) - db_sess.created_at.replace(tzinfo=timezone.utc)
                session_duration = int(delta.total_seconds())
        fraud_assessment = self.fraud_agent.compute_assessment(session_duration_seconds=max(session_duration, 1))

        avg_latency = 0.0
        if self.response_latencies:
            avg_latency = sum(self.response_latencies) / len(self.response_latencies)

        # Update database fields
        if self.db_session:
            from database import InterviewSession
            db_sess = self.db_session.query(InterviewSession).filter_by(id=self.session_id).first()
            if db_sess:
                db_sess.gaze_heatmap = json.dumps(self.cv_agent.gaze_heatmap)
                db_sess.response_latency = avg_latency
                if self.keystroke_profile_data:
                    db_sess.keystroke_profile = json.dumps(self.keystroke_profile_data)
                self.db_session.commit()

        risk_summary = {
            "total_events": len(self._risk_events),
            "integrity_score": compute_integrity_score(self._risk_events),
            "fraud_score": fraud_assessment.fraud_score,
            "verdict": fraud_assessment.verdict,
            "cv_summary": self.cv_agent.summary(),
            "bias_blocked": self.bias_agent.blocked_count,
            "response_latency": avg_latency,
        }
        await self.memory_agent.write_episode(
            conversation = list(self._history),
            risk_summary = risk_summary,
        )
        log.info("[Hub] Session ended — memory written")
        return risk_summary

    @property
    def agent_statuses(self) -> dict:
        return dict(self._agent_statuses)

    @property
    def integrity_score(self) -> int:
        return compute_integrity_score(self._risk_events)
