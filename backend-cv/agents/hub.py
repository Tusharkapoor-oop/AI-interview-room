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
import logging
import re
from collections import deque
from datetime import datetime, timezone
from typing import Optional

from .bias_agent import BiasAuditAgent
from .code_review_agent import CodeReviewAgent
from .cv_agent import CVAgent, RiskEvent
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
from .deepfake_agent import DeepfakeAgentEvaluator
from .kinematic_agent import KinematicAgentEvaluator
from .liveness_agent import LivenessAgentEvaluator

log = logging.getLogger("aegis.hub")

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

# ── Integrity Score Algorithm ─────────────────────────────────────────────────
def compute_score(events: list[RiskEvent]) -> int:
    penalties = sum(
        8 if e.severity == "HIGH"     else
        4 if e.severity == "MEDIUM"   else
        12 if e.severity == "CRITICAL" else 1
        for e in events
    )
    return max(100 - penalties, 0)


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
        self._history: deque = deque(maxlen=50)
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
        self.ks_detector = KSAnomalyDetector()
        self.liveness_verifier = LivenessVerifier()
        self.fusion_engine = FiveChannelFusionEngine()
        # Wired dead-code agents (P1-12)
        self.deepfake_evaluator = DeepfakeAgentEvaluator()
        self.kinematic_evaluator = KinematicAgentEvaluator()
        self.liveness_evaluator = LivenessAgentEvaluator()

        # Trajectory/keystroke metadata
        self.response_latencies = []
        self.keystroke_profile_data = None

        # KS baseline buffer — collects real gaze data for baseline calibration
        self._gaze_baseline_buffer: list[float] = []
        self._baseline_fitted = False

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
            score = compute_score(self._risk_events)
            await self._maybe_hitl(score)
            log.info("[Hub] Risk event logged — %s %s (score=%d)", event.severity, event.event_type, score)

        self._update_status("cv_agent", "monitoring")
        return event

    def ingest_security_features(self, inference: dict) -> Optional[dict]:
        """Run the new security engine over the frame-level telemetry."""
        try:
            gaze_estimate = self.gaze_tracker.update_gaze(
                pitch=float(inference.get("head_pose", {}).get("pitch", 0.0)),
                yaw=float(inference.get("head_pose", {}).get("yaw", 0.0)),
                nose_x=float(inference.get("nose_x", 0.5)),
                nose_y=float(inference.get("nose_y", 0.5)),
                depth=float(inference.get("depth", 0.6)),
            )
            gesture_event = self.gesture_engine.update_frame(
                left_wrist=inference.get("left_wrist"),
                right_wrist=inference.get("right_wrist"),
                head_pitch=float(inference.get("head_pose", {}).get("pitch", 0.0)),
                head_yaw=float(inference.get("head_pose", {}).get("yaw", 0.0)),
                face_count=int(inference.get("face_count", 1)),
            )
            liveness = self.liveness_verifier.evaluate(
                pupil_response_latency_ms=float(inference.get("pupil_response_latency_ms", 180.0)),
                bpm=float(inference.get("bpm", 78.0)),
                signal_quality=float(inference.get("signal_quality", 0.9)),
            )

            if not self._baseline_fitted:
                self._gaze_baseline_buffer.append(gaze_estimate["screen_x"])
                if len(self._gaze_baseline_buffer) >= 30:
                    self.ks_detector.fit_baseline(self._gaze_baseline_buffer)
                    self._baseline_fitted = True
                    log.info("[Hub] KS baseline fitted with %d real gaze samples", len(self._gaze_baseline_buffer))
            ks_anomalous = self.ks_detector.is_anomalous([gaze_estimate["screen_x"], gaze_estimate["screen_y"]]) if self._baseline_fitted else False

            # P1-12: Wire deepfake + kinematic + liveness evaluators
            deepfake_risk = self.deepfake_evaluator.evaluate_stream(
                mouth_velocities=inference.get("mouth_velocities", []),
                audio_energies=inference.get("audio_energies", []),
                spectral_artifact_scores=inference.get("spectral_artifact_scores", []),
            )
            kinematic_result = self.kinematic_evaluator.evaluate_frame(
                skeletons=inference.get("skeletons", [])
            )

            self.fusion_engine.add_channel_result("gaze", bool(inference.get("gaze_anomaly", False) or ks_anomalous), gaze_estimate["confidence"])
            self.fusion_engine.add_channel_result("gesture", gesture_event is not None, 0.86 if gesture_event else 0.12)
            self.fusion_engine.add_channel_result("audio", bool(inference.get("audio_anomaly", False)), 0.75)
            self.fusion_engine.add_channel_result("keystroke", bool(inference.get("typing_anomaly", False)), 0.7)
            self.fusion_engine.add_channel_result("content", bool(inference.get("content_anomaly", False)), 0.68)
            fusion = self.fusion_engine.evaluate()
            return {
                "gaze_estimate": gaze_estimate,
                "gesture_event": gesture_event.to_dict() if gesture_event else None,
                "liveness": liveness,
                "ks_anomalous": ks_anomalous,
                "fusion": fusion,
                "deepfake": deepfake_risk,
                "kinematic": kinematic_result,
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

        score = compute_score(self._risk_events)
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

            score = compute_score(self._risk_events)
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
        Hub's main ReAct loop per turn:

        Thought: what does the candidate need? what context is relevant?
        Action1: run BiasAuditAgent on proposed next question
        Action2: call Aria (GPT-4o) with enriched context
        Obs:     parse response, check for code submissions
        Reply:   return structured response payload
        """
        # ── THOUGHT ──────────────────────────────────────────────────────────
        self._update_status("aria", "thinking")
        self._history.append({"role": "user", "content": candidate_message})

        # Detect code submission
        has_code = "```" in candidate_message or candidate_message.strip().startswith("def ")

        # Build memory-enriched system prompt
        memory_block = self._memory_ctx.to_prompt_block()
        system_prompt = ARIA_SYSTEM.format(
            memory_block = memory_block,
            language     = self.language,
        )

        messages = [{"role": "system", "content": system_prompt}] + list(self._history)

        # ── ACTION 1: Bias pre-check on the PREVIOUS AI message (audit loop) ─
        # We audit what Aria said LAST to ensure retrospective fairness
        last_ai = next(
            (m["content"] for m in reversed(self._history) if m["role"] == "assistant"),
            ""
        )
        if last_ai:
            self._update_status("bias_agent", "auditing")
            audit = await self.bias_agent.audit(last_ai)
            self._update_status("bias_agent", "ready")
            if not audit.safe:
                # Aria asked a biased question — log it and inject correction
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

        # ── ACTION 2: Aria generates response ────────────────────────────────
        self._update_status("aria", "generating")
        reply_text = ""

        if self.ai_client:
            try:
                resp = await self.ai_client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    max_tokens=220,
                    temperature=0.72,
                )
                reply_text = resp.choices[0].message.content
            except Exception as e:
                log.warning("[Hub] Aria AI call failed: %s", e)
                reply_text = "That's a thoughtful response! Can you walk me through the specific trade-offs you weighed?"
        else:
            # Offline mock
            import random
            reply_text = random.choice([
                "That's an excellent point! What was the most complex technical decision in that work?",
                "Interesting approach. How did you validate the correctness of that solution?",
                "Walk me through how you'd scale that system to handle 100× the load.",
                "What would you do differently if you were starting that project today?",
            ])

        self._history.append({"role": "assistant", "content": reply_text})
        self._update_status("aria", "idle")

        # ── OBSERVATION: Code review if submission detected ───────────────────
        code_review = None
        if has_code:
            self._update_status("code_review", "reviewing")
            question_context = next(
                (m["content"] for m in self._history if m["role"] == "system"),
                "General coding challenge"
            )
            code_review = await self.code_review_agent.review(
                code     = candidate_message,
                language = "python",
                question = question_context,
            )
            self._update_status("code_review", "idle")
            log.info("[Hub] Code review done — score=%d, correctness=%s",
                     code_review.score, code_review.correctness)

            # If plagiarism detected — HITL escalation regardless of integrity score
            if code_review.cheating_flag and self._broadcast:
                await self._broadcast({
                    "type":    "HITL_CODE_PLAGIARISM",
                    "session": self.session_id,
                    "message": f"Plagiarism detected: {code_review.cheating_note}",
                    "options": ["IGNORE", "FLAG_FOR_REVIEW", "TERMINATE"],
                    "expires": 30,
                })

        # ── Return structured payload ─────────────────────────────────────────
        return {
            "role":           "ai",
            "message":        reply_text,
            "agent_statuses": dict(self._agent_statuses),
            "integrity_score": compute_score(self._risk_events),
            "code_review":    code_review.to_dict() if code_review else None,
            "timestamp":      datetime.now(timezone.utc).isoformat(),
        }

    async def end_session(self):
        """Called when the WebSocket closes — writes episodic memory, finalizes artifacts."""
        log.info("[Hub] Ending session %s", self.session_id)
        
        fraud_assessment = self.fraud_agent.compute_assessment()
        
        avg_latency = 0.0
        if self.response_latencies:
            avg_latency = sum(self.response_latencies) / len(self.response_latencies)

        # Update database fields
        if self.db_session:
            from database import InterviewSession
            db_sess = self.db_session.query(InterviewSession).filter_by(id=self.session_id).first()
            if db_sess:
                import json
                db_sess.gaze_heatmap = json.dumps(self.cv_agent.gaze_heatmap)
                db_sess.response_latency = avg_latency
                if self.keystroke_profile_data:
                    db_sess.keystroke_profile = json.dumps(self.keystroke_profile_data)
                self.db_session.commit()

        risk_summary = {
            "total_events": len(self._risk_events),
            "integrity_score": compute_score(self._risk_events),
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
        return compute_score(self._risk_events)
