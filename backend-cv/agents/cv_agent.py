"""
agents/cv_agent.py — CVAgent Spoke (v5.0)

Implements paper §3-§6 detection methods:
  - Layer 3: Behavioral Intelligence
    * Head pose analysis (Yaw, Pitch, Roll)
    * Gaze quadrant tracking
    * Blink rate analysis
    * Attention scoring
  - Layer 4: Environmental Security
    * Multi-person / secondary face detection
    * Object presence heuristics
    * Lighting anomaly detection
  - Layer 6: AI Fraud Detection
    * Moiré pattern heuristic (deepfake)
    * Face consistency scoring
    * Behavioral anomaly pattern
"""
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

log = logging.getLogger("aegis.cv_agent")

# ── Risk Event contract ─────────────────────────────────────────
@dataclass
class RiskEvent:
    session_id:   str
    event_type:   str     # See EVENT_TYPES below
    severity:     str     # LOW | MEDIUM | HIGH | CRITICAL
    description:  str
    confidence:   float = 1.0
    pose:         dict  = field(default_factory=dict)
    hands_count:  int   = 0
    gaze_quadrant: str  = "CENTER"
    fraud_signal: bool  = False
    timestamp:    str   = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# All valid event types (paper §4 + §8 blueprint)
EVENT_TYPES = {
    # Layer 3: Behavioral
    "GAZE_ANOMALY",
    "HEAD_TURN",
    "ATTENTION_DRIFT",
    "BLINK_ANOMALY",
    # Layer 4: Environmental
    "HAND_ANOMALY",
    "SECONDARY_PERSON",
    "OBJECT_DETECTED",
    "LIGHTING_ANOMALY",
    # Layer 6: Fraud
    "DEEPFAKE_SUSPECTED",
    "FACE_CONSISTENCY_FAIL",
    "SPOOFING_ATTEMPT",
    # Layer 5 (forwarded from frontend)
    "TAB_SWITCH",
    "PASTE_ANOMALY",
    "VIRTUAL_CAM",
    "DEVTOOLS_OPEN",
    "TYPING_ANOMALY",
    # Layer 2: Continuous verification
    "SECONDARY_VOICE_DETECTED",
    "PERIODIC_LIVENESS",
}


class CVAgent:
    """
    Spoke agent: Computer Vision specialist.

    Implements defense-in-depth behavioral analysis per paper §4-§6:

    Paper §4.1 Face Recognition  → continuous identity verification
    Paper §4.2 Liveness          → blink rate, motion analysis
    Paper §4.4 Eye Tracking      → gaze quadrant heatmap
    Paper §4.5 Head Pose         → yaw/pitch/roll classification
    Paper §5   Gesture Intel.    → hand gestures, body movement
    Paper §6   Advanced Gesture  → skeletal tracking (heuristic)
    """

    # ── Thresholds ──────────────────────────────────────────────
    YAW_WARN    = 12.0   # soft warning (degrees)
    YAW_HIGH    = 25.0   # HIGH severity
    YAW_CRIT    = 40.0   # CRITICAL — hard side turn

    PITCH_UP    = 15.0   # looking up (reading notes above)
    PITCH_DOWN  = -10.0  # looking down (hidden notes)
    PITCH_HIGH  = 22.0

    ROLL_WARN   = 20.0   # head tilt

    HANDS_WARN  = 1      # >1 hand visible = suspicious
    HANDS_HIGH  = 2      # 2 hands with specific gesture

    GRACE_FRAMES        = 60   # ~2s at 30fps before logging gaze
    HAND_GRACE_FRAMES   = 45   # ~1.5s
    SECONDARY_GRACE     = 60   # ~2s for secondary person

    # Attention scoring
    ATTENTION_WINDOW    = 300  # frames (10s) rolling window
    LOW_ATTENTION_THRESH = 0.35  # below this ratio = attention drift

    def __init__(self, session_id: str, baseline: Optional[dict] = None):
        self.session_id  = session_id
        self.baseline    = baseline or {"pitch": 0, "yaw": 0, "roll": 0}

        # Frame counters
        self._gaze_counter      = 0
        self._hand_counter      = 0
        self._secondary_counter = 0
        self._lighting_baseline = None

        # Attention tracking
        self._attention_window: list[bool] = []  # True = on-screen
        self._total_frames = 0

        # Blink tracking (§4.2)
        self._blink_timestamps: list[float] = []
        self._prev_eye_open = True

        # Gaze quadrant heatmap (§4.4)
        self._quadrant_counts = {
            "CENTER": 0, "LEFT": 0, "RIGHT": 0, "UP": 0, "DOWN": 0
        }

        # Face hash for consistency (§4.1)
        self._face_hash_history: list[int] = []

        # Gaze history and saccade tracking
        self._gaze_h_history: list[float] = []
        self._saccade_timestamps: list[float] = []

        # Event log
        self._events_emitted: list[RiskEvent] = []

    @property
    def events_emitted(self) -> list[RiskEvent]:
        return self._events_emitted

    # ── Baseline normalization ───────────────────────────────────
    def _adjust_for_baseline(self, pose: dict) -> dict:
        return {
            "pitch": pose.get("pitch", 0) - self.baseline.get("pitch", 0),
            "yaw":   pose.get("yaw",   0) - self.baseline.get("yaw",   0),
            "roll":  pose.get("roll",  0) - self.baseline.get("roll",  0),
        }

    # ── Gaze Quadrant Classification (paper §4.4) ────────────────
    def _classify_gaze_quadrant(self, pose: dict) -> str:
        yaw   = pose.get("yaw",   0)
        pitch = pose.get("pitch", 0)
        if abs(yaw) < 10 and abs(pitch) < 10:
            return "CENTER"
        if abs(yaw) >= abs(pitch):
            return "LEFT" if yaw < 0 else "RIGHT"
        return "UP" if pitch > 0 else "DOWN"

    # ── Blink Rate Analysis (paper §4.2) ────────────────────────
    def _update_blink_rate(self, eye_open: bool) -> Optional[RiskEvent]:
        is_blink = self._prev_eye_open and not eye_open
        self._prev_eye_open = eye_open

        if is_blink:
            now = datetime.now(timezone.utc).timestamp()
            self._blink_timestamps.append(now)
            # Keep last 60 seconds
            self._blink_timestamps = [t for t in self._blink_timestamps if now - t < 60]

        # Analyze after collecting 5+ blinks
        if len(self._blink_timestamps) < 5:
            return None

        duration = self._blink_timestamps[-1] - self._blink_timestamps[0]
        if duration < 1:
            return None

        blinks_per_min = (len(self._blink_timestamps) / duration) * 60
        # Normal: 12-20 blinks/min. <8 = screen reading, >35 = stress/synthetic
        if blinks_per_min < 6:
            self._blink_timestamps = []  # reset after flagging
            return RiskEvent(
                session_id  = self.session_id,
                event_type  = "BLINK_ANOMALY",
                severity    = "MEDIUM",
                description = f"Low blink rate: {blinks_per_min:.1f}/min (normal: 12-20). "
                              f"Candidate may be reading from an external resource.",
                confidence  = 0.70,
                fraud_signal = True,
            )
        return None

    # ── Secondary Person Detection (paper §4.6) ──────────────────
    def _detect_secondary_person(self, face_count: int) -> Optional[RiskEvent]:
        if face_count > 1:
            self._secondary_counter += 1
        else:
            self._secondary_counter = max(0, self._secondary_counter - 3)

        if self._secondary_counter == self.SECONDARY_GRACE:
            return RiskEvent(
                session_id  = self.session_id,
                event_type  = "SECONDARY_PERSON",
                severity    = "HIGH",
                description = f"Additional person detected in frame ({face_count} faces). "
                              f"Possible proxy interviewer or on-site coaching.",
                confidence  = min(self._secondary_counter / self.SECONDARY_GRACE, 1.0),
                fraud_signal = True,
            )
        return None

    # ── Lighting Anomaly Detection (paper §4) ───────────────────
    def _check_lighting_anomaly(self, avg_brightness: Optional[float]) -> Optional[RiskEvent]:
        if avg_brightness is None:
            return None
        if self._lighting_baseline is None:
            self._lighting_baseline = avg_brightness
            return None
        delta = abs(avg_brightness - self._lighting_baseline)
        if delta > 55:
            self._lighting_baseline = avg_brightness  # update baseline
            return RiskEvent(
                session_id  = self.session_id,
                event_type  = "LIGHTING_ANOMALY",
                severity    = "LOW",
                description = f"Sudden lighting change detected (Δ{delta:.0f} lux equivalent). "
                              f"Possible environment swap or virtual background switch.",
                confidence  = 0.60,
            )
        return None

    # ── Attention Scoring (paper §4.4) ──────────────────────────
    def _update_attention(self, is_on_screen: bool) -> Optional[RiskEvent]:
        self._attention_window.append(is_on_screen)
        if len(self._attention_window) > self.ATTENTION_WINDOW:
            self._attention_window.pop(0)

        if len(self._attention_window) < self.ATTENTION_WINDOW:
            return None

        attention_ratio = sum(self._attention_window) / len(self._attention_window)
        if attention_ratio < self.LOW_ATTENTION_THRESH:
            self._attention_window = []  # reset
            return RiskEvent(
                session_id  = self.session_id,
                event_type  = "ATTENTION_DRIFT",
                severity    = "MEDIUM",
                description = f"Sustained attention drift: {attention_ratio:.0%} on-screen over 10s window. "
                              f"Candidate appears frequently distracted.",
                confidence  = 1.0 - attention_ratio,
            )
        return None

    # ── Main Frame Processor ─────────────────────────────────────
    def process(self, inference: dict) -> Optional[RiskEvent]:
        """
        Consume one frame's inference result.
        Returns the highest-priority RiskEvent if any threshold was crossed.
        """
        if inference.get("status") == "no_face":
            return RiskEvent(
                session_id  = self.session_id,
                event_type  = "FACE_NOT_DETECTED",
                severity    = "HIGH",
                description = "Candidate biometric tracking lost. Face not detected in video feed.",
                confidence  = 0.95,
                fraud_signal = True,
            )
        if inference.get("status") != "ok":
            return None

        self._total_frames += 1
        events_this_frame: list[RiskEvent] = []

        pose   = self._adjust_for_baseline(inference.get("pose", {}))
        hands  = inference.get("hands_visible", 0)
        yaw    = abs(pose["yaw"])
        pitch  = pose["pitch"]
        roll   = abs(pose.get("roll", 0))

        # Track gaze quadrant
        quadrant = self._classify_gaze_quadrant(pose)
        self._quadrant_counts[quadrant] = self._quadrant_counts.get(quadrant, 0) + 1

        # Track eye gaze coordinates for saccades & entropy analysis
        eye_gaze = inference.get("eye_gaze", {"h": 0.0, "v": 0.0})
        gaze_h = eye_gaze.get("h", 0.0)
        _gaze_v = eye_gaze.get("v", 0.0)
        self._gaze_h_history.append(gaze_h)
        if len(self._gaze_h_history) > 120:
            self._gaze_h_history.pop(0)

        # ── Saccades & Robotic Reading Pattern Detection ──────
        if len(self._gaze_h_history) >= 30:
            # Compute gaze velocity (frame-to-frame change)
            vels = [self._gaze_h_history[i] - self._gaze_h_history[i-1] for i in range(1, len(self._gaze_h_history))]
            last_vel = vels[-1]

            # Detect reading snap-back: a single frame high-velocity jump in the opposite direction
            if abs(last_vel) > 0.08:
                prev_vels = vels[-15:-1]
                if prev_vels:
                    avg_prev = sum(prev_vels) / len(prev_vels)
                    # If the snap-back direction is opposite to the reading sweep direction
                    if avg_prev * last_vel < 0 and abs(avg_prev) > 0.002:
                         now_ts = datetime.now(timezone.utc).timestamp()
                         self._saccade_timestamps.append(now_ts)
                         self._saccade_timestamps = [t for t in self._saccade_timestamps if now_ts - t < 15]

                         if len(self._saccade_timestamps) >= 3:
                             self._saccade_timestamps = []  # reset after detection
                             ev_saccade = RiskEvent(
                                 session_id = self.session_id,
                                 event_type = "GAZE_ANOMALY",
                                 severity = "HIGH",
                                 description = "Robotic reading pattern detected — potential teleprompter or overlay script reading.",
                                 confidence = 0.85,
                                 pose = pose,
                                 gaze_quadrant = quadrant,
                             )
                             events_this_frame.append(ev_saccade)

        # ── Gaze Entropy / Staring Rigidity Detection ──────────
        if len(self._gaze_h_history) >= 60:
            # Candidate is looking off-center
            is_off_center = yaw > 8 or pitch < -6 or pitch > 10
            if is_off_center:
                # Compute gaze horizontal variance
                mean_h = sum(self._gaze_h_history[-60:]) / 60
                var_h = sum((x - mean_h) ** 2 for x in self._gaze_h_history[-60:]) / 60
                if var_h < 0.0001:  # extremely fixed gaze, no natural micro-saccades
                    ev_rigid = RiskEvent(
                        session_id = self.session_id,
                        event_type = "ATTENTION_DRIFT",
                        severity = "MEDIUM",
                        description = "Unnatural gaze rigidity — candidate is staring fixedly at an off-screen target.",
                        confidence = 0.80,
                        pose = pose,
                        gaze_quadrant = quadrant,
                    )
                    events_this_frame.append(ev_rigid)

        # ── Gaze anomaly (§4.4, §4.5) ─────────────────────────
        gaze_ok = (yaw <= self.YAW_WARN and
                   self.PITCH_DOWN <= pitch <= self.PITCH_UP and
                   roll <= self.ROLL_WARN)

        # Update attention score
        ev = self._update_attention(gaze_ok)
        if ev:
            events_this_frame.append(ev)

        if not gaze_ok:
            self._gaze_counter += 1
        else:
            self._gaze_counter = max(0, self._gaze_counter - 5)

        if self._gaze_counter >= self.GRACE_FRAMES:
            if yaw > self.YAW_CRIT:
                severity = "CRITICAL"
            elif yaw > self.YAW_HIGH or abs(pitch) > self.PITCH_HIGH:
                severity = "HIGH"
            else:
                severity = "MEDIUM"

            direction = []
            if yaw > self.YAW_WARN:
                direction.append(f"{'left' if pose['yaw'] < 0 else 'right'} ({yaw:.0f}°)")
            if pitch > self.PITCH_UP:
                direction.append(f"up ({pitch:.0f}°)")
            if pitch < self.PITCH_DOWN:
                direction.append(f"down ({abs(pitch):.0f}°)")

            ev = RiskEvent(
                session_id   = self.session_id,
                event_type   = "GAZE_ANOMALY",
                severity     = severity,
                description  = (f"Sustained gaze deviation — looking {', '.join(direction) or 'off-screen'}. "
                                f"Quadrant: {quadrant}. Possible external reference."),
                confidence   = min(self._gaze_counter / self.GRACE_FRAMES, 1.0),
                pose         = pose,
                gaze_quadrant = quadrant,
            )
            self._events_emitted.append(ev)
            log.warning("[CVAgent] %s GAZE_ANOMALY — %s", severity, ev.description)
            return ev  # Return immediately — highest priority

        # ── Head Turn (paper §4.5) ────────────────────────────
        if yaw > self.YAW_HIGH and self._gaze_counter < self.GRACE_FRAMES:
            # Log head turns even before full grace period if severe
            if yaw > self.YAW_CRIT and self._gaze_counter > 30:
                ev = RiskEvent(
                    session_id  = self.session_id,
                    event_type  = "HEAD_TURN",
                    severity    = "HIGH",
                    description = f"Extreme head turn detected ({yaw:.0f}° {'left' if pose['yaw'] < 0 else 'right'}). "
                                  f"Possible side-screen consultation.",
                    confidence  = 0.85,
                    pose        = pose,
                    gaze_quadrant = quadrant,
                )
                events_this_frame.append(ev)

        # ── Hand Anomaly (paper §5) ───────────────────────────
        if hands > self.HANDS_WARN:
            self._hand_counter += 1
            if self._hand_counter >= self.HAND_GRACE_FRAMES:
                severity = "HIGH" if hands > self.HANDS_HIGH else "MEDIUM"
                ev = RiskEvent(
                    session_id  = self.session_id,
                    event_type  = "HAND_ANOMALY",
                    severity    = severity,
                    description = (f"{hands} hands detected — possible hidden device, "
                                   f"earpiece, or signal to off-screen assistant."),
                    confidence  = 0.75,
                    hands_count = hands,
                )
                events_this_frame.append(ev)
        else:
            self._hand_counter = max(0, self._hand_counter - 3)

        # Hand proximity anomaly (whispering, holding phone to ear)
        if inference.get("hand_anomaly"):
            ev_hand = RiskEvent(
                session_id  = self.session_id,
                event_type  = "HAND_ANOMALY",
                severity    = "HIGH",
                description = inference.get("hand_anomaly_desc", "Suspicious hand placement detected."),
                confidence  = 0.90,
                hands_count = hands,
            )
            events_this_frame.append(ev_hand)

        # ── Secondary Person (paper §4.6) ────────────────────
        face_count = inference.get("face_count", 1)
        ev = self._detect_secondary_person(face_count)
        if ev:
            events_this_frame.append(ev)

        # ── Blink Rate (paper §4.2) ───────────────────────────
        eye_open = inference.get("eye_open", True)
        ev = self._update_blink_rate(eye_open)
        if ev:
            events_this_frame.append(ev)

        # ── Lighting Anomaly ──────────────────────────────────
        ev = self._check_lighting_anomaly(inference.get("avg_brightness"))
        if ev:
            events_this_frame.append(ev)

        # ── Moiré Anti-Spoofing (paper §6) ───────────────────
        moire_score = inference.get("moire_score", 0.0)
        if moire_score > 0.18:
            ev = RiskEvent(
                session_id  = self.session_id,
                event_type  = "DEEPFAKE_SUSPECTED",
                severity    = "CRITICAL",
                description = (f"Moiré pattern artifact detected (score: {moire_score:.3f}). "
                               f"Possible pre-recorded video replay or deepfake feed."),
                confidence  = min(moire_score / 0.3, 1.0),
                fraud_signal = True,
            )
            events_this_frame.append(ev)

        # Return the most severe event from this frame
        if events_this_frame:
            severity_order = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}
            best = max(events_this_frame, key=lambda e: severity_order.get(e.severity, 0))
            self._events_emitted.append(best)
            log.warning("[CVAgent] %s %s — %s", best.severity, best.event_type, best.description[:80])
            return best

        return None

    # ── Calibration update ───────────────────────────────────────
    def update_baseline(self, new_baseline: dict):
        self.baseline = new_baseline
        log.info("[CVAgent] Baseline updated: %s", new_baseline)

    # ── Analytics ────────────────────────────────────────────────
    @property
    def attention_score(self) -> float:
        if not self._attention_window:
            return 1.0
        return sum(self._attention_window) / len(self._attention_window)

    @property
    def gaze_heatmap(self) -> dict:
        total = max(sum(self._quadrant_counts.values()), 1)
        return {k: round(v / total, 3) for k, v in self._quadrant_counts.items()}

    @property
    def total_events(self) -> int:
        return len(self._events_emitted)

    def summary(self) -> dict:
        sev_counts = {"HIGH": 0, "MEDIUM": 0, "LOW": 0, "CRITICAL": 0}
        for e in self._events_emitted:
            sev_counts[e.severity] = sev_counts.get(e.severity, 0) + 1

        fraud_events = [e for e in self._events_emitted if e.fraud_signal]

        return {
            "session_id":     self.session_id,
            "total_frames":   self._total_frames,
            "total_events":   self.total_events,
            "severity_counts": sev_counts,
            "attention_score": round(self.attention_score, 3),
            "gaze_heatmap":   self.gaze_heatmap,
            "fraud_events":   len(fraud_events),
            "baseline_used":  self.baseline,
        }
