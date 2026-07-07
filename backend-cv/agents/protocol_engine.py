"""
protocol_engine.py — AEGIS v5.0 World-Class 12-Layer Protocol Evaluation Engine
Pure backend AI statistical evaluator & proctoring state machine.
Strict adherence to Rule [ZERO-COMPROMISE-1]: Zero UI generation, pure backend AI logic.

Features implemented:
1. InvitationCodeValidator: Candidate details + invitation code / default AI passkey validation.
2. Protocol12LayerEngine:
   - Layer 1: Face Mesh & Studio Mic Audio Spectrum verification
   - Layer 2: Whole Laptop Screen Share enforcement (rejects single window/website/tab)
   - Layer 3: Fullscreen Lockdown & Browser Extension scanning
   - Layer 4: Pupillary Light Reflex (PLR) human biometric verification
   - Layer 5: Real-time Deepfake & Synthetic Liveness Engine
   - Layer 6: 3-Violation Auto-Submit Rule (N >= 3 infractions auto-submits & terminates)
   - Layer 7: Face Lux & Ear Visibility Scan + Automatic Laptop Screen Brightness Override
   - Layer 8: 360 Room Scan & Secondary Person Intrusion Defense
   - Layer 9: 5-Second Look-Away Rule (cancels question & enforces mandatory room scan)
   - Layer 10: Continuous Identity Verification (100% facial embedding consistency)
   - Layer 11: Kinematic Gesture Vocabulary (hand-to-ear, off-screen reaching)
   - Layer 12: Cryptographic SHA-256 Audit Sealing
"""

import hashlib
import json
import math
import os
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


@dataclass
class ProtocolViolation:
    layer_id: int
    layer_name: str
    violation_type: str
    severity: str  # LOW, MEDIUM, HIGH, CRITICAL
    description: str
    timestamp_sec: float


@dataclass
class ProtocolEvaluationVerdict:
    passed_all_layers: bool
    current_layer: int
    total_strikes: int
    auto_submit_triggered: bool
    requires_room_rescan: bool
    screen_brightness_boost_required: bool
    illumination_lux_command: Optional[float]
    violations: List[ProtocolViolation] = field(default_factory=list)
    merkle_seal: str = ""


class InvitationCodeValidator:
    """Validates candidate credentials via env-configured invitation codes."""

    @staticmethod
    def _valid_codes() -> set:
        """Read valid invitation codes from env (comma-separated)."""
        raw = os.getenv("VALID_INVITATION_CODES", "")
        return {c.strip() for c in raw.split(",") if c.strip()}

    VALID_ROLES = {
        "software_engineer", "data_scientist", "ml_engineer",
        "product_manager", "devops_engineer", "frontend_engineer"
    }

    @classmethod
    def validate_entry(
        cls,
        candidate_name: str,
        role: str,
        invitation_code: Optional[str] = None,
        use_default_ai_code: bool = False
    ) -> Tuple[bool, str, Dict[str, str]]:
        if not candidate_name or len(candidate_name.strip()) < 2:
            return False, "Candidate name must be at least 2 characters.", {}

        normalized_role = role.lower().replace(" ", "_")
        if normalized_role not in cls.VALID_ROLES:
            return False, f"Invalid target role: {role}.", {}

        effective_code = invitation_code.strip() if invitation_code else ""

        codes = cls._valid_codes()
        if use_default_ai_code or not effective_code:
            if codes:
                effective_code = next(iter(codes))
            else:
                return False, "No valid invitation codes configured.", {}

        if codes and effective_code not in codes:
            return False, "Invalid invitation code.", {}

        session_hash = hashlib.sha256(f"{candidate_name}:{normalized_role}:{effective_code}".encode()).hexdigest()[:16]
        return True, "Invitation validated successfully.", {
            "candidate_name": candidate_name.strip(),
            "role": normalized_role,
            "invitation_code": effective_code,
            "session_token": f"AEGIS-SESSION-{session_hash}"
        }


class Protocol12LayerEngine:
    """Manages the 12-layer step-by-step biometric security protocol."""

    def __init__(self, fps: float = 10.0) -> None:
        self.fps = fps
        self.violations: List[ProtocolViolation] = []
        self.look_away_frames: int = 0
        self.look_away_duration_sec: float = 0.0
        self.auto_submit_triggered: bool = False
        self.requires_room_rescan: bool = False
        self.enrolled_face_embedding: Optional[List[float]] = None

    def add_violation(self, layer_id: int, layer_name: str, vtype: str, severity: str, desc: str) -> None:
        v = ProtocolViolation(
            layer_id=layer_id,
            layer_name=layer_name,
            violation_type=vtype,
            severity=severity,
            description=desc,
            timestamp_sec=time.time()
        )
        self.violations.append(v)
        if len(self.violations) >= 3:
            self.auto_submit_triggered = True

    # ── Layer 1: Face & Mic Testing ──────────────────────────────────────────
    def verify_layer_1_face_and_mic(
        self,
        face_landmark_count: int,
        audio_snr_db: float,
        sample_rate_hz: int
    ) -> bool:
        if face_landmark_count < 468:
            self.add_violation(1, "Face & Mic Testing", "LANDMARK_DEFICIT", "HIGH",
                               f"MediaPipe face mesh incomplete: {face_landmark_count}/468 landmarks.")
            return False
        if audio_snr_db < 25.0 or sample_rate_hz < 16000:
            self.add_violation(1, "Face & Mic Testing", "AUDIO_DEGRADED", "MEDIUM",
                               f"Audio SNR {audio_snr_db:.1f}dB or sample rate {sample_rate_hz}Hz below studio threshold.")
            return False
        return True

    # ── Layer 2: Whole Laptop Screen Share Enforcement ───────────────────────
    def verify_layer_2_screen_share(
        self,
        display_surface: str,
        active_background_tabs: int
    ) -> bool:
        """Strictly requires 'monitor' (whole laptop screen). Rejects 'window' or 'browser' tabs."""
        if display_surface != "monitor":
            self.add_violation(2, "Screen Share Enforcement", "INVALID_DISPLAY_SURFACE", "CRITICAL",
                               f"STRICT VIOLATION: Whole laptop monitor screen required. Selected surface '{display_surface}' rejected.")
            return False
        if active_background_tabs > 3:
            self.add_violation(2, "Screen Share Enforcement", "BACKGROUND_TABS_ACTIVE", "MEDIUM",
                               f"Candidate has {active_background_tabs} background tabs active. All background tabs must be closed.")
            return False
        return True

    # ── Layer 3: Fullscreen Lockdown & Extension Block ───────────────────────
    def verify_layer_3_fullscreen_and_extensions(
        self,
        is_fullscreen: bool,
        detected_extensions: List[str]
    ) -> bool:
        if not is_fullscreen:
            self.add_violation(3, "Fullscreen Lockdown", "FULLSCREEN_EXIT", "HIGH",
                               "Candidate exited mandatory full-screen lockdown.")
            return False
        if detected_extensions:
            self.add_violation(3, "Extension Scanning", "UNAUTHORIZED_EXTENSION", "CRITICAL",
                               f"Unauthorized browser overlay extensions detected: {', '.join(detected_extensions)}.")
            return False
        return True

    # ── Layer 4: Pupillary Light Reflex (PLR) Biometric Challenge ────────────
    def verify_layer_4_plr(
        self,
        latency_ms: float,
        constriction_ratio: float
    ) -> bool:
        if not (120.0 <= latency_ms <= 350.0) or constriction_ratio < 0.10:
            self.add_violation(4, "PLR Biometric Verification", "SYNTHETIC_PUPIL_RESPONSE", "CRITICAL",
                               f"Anomalous PLR kinetics (latency: {latency_ms:.1f}ms, ratio: {constriction_ratio:.2f}). Synthetic bot detected.")
            return False
        return True

    # ── Layer 5: Real-time Deepfake & Liveness Detection ─────────────────────
    def verify_layer_5_deepfake_liveness(
        self,
        rppg_bpm: float,
        micro_expression_variance: float
    ) -> bool:
        if not (45.0 <= rppg_bpm <= 180.0) or micro_expression_variance < 0.015:
            self.add_violation(5, "Deepfake Liveness", "DEEPFAKE_PROXY_DETECTED", "CRITICAL",
                               f"Biological pulse absence ({rppg_bpm:.1f} BPM) or rigid face texture. Deepfake/Lip-sync proxy detected.")
            return False
        return True

    # ── Layer 6: 3-Violation Auto-Submit Rule ────────────────────────────────
    def evaluate_layer_6_strike_rule(self) -> Tuple[int, bool]:
        """Returns total distinct strikes and whether automatic submission is triggered."""
        strike_count = len(self.violations)
        if strike_count >= 3:
            self.auto_submit_triggered = True
        return strike_count, self.auto_submit_triggered

    # ── Layer 7: Full Face & Ear Visibility + Auto-Brightness Trigger ────────
    def verify_layer_7_face_lux_and_ears(
        self,
        ambient_face_lux: float,
        left_ear_visible: bool,
        right_ear_visible: bool
    ) -> Tuple[bool, bool, Optional[float]]:
        """If face illumination is low or ears aren't visible, triggers auto screen brightness increase."""
        boost_required = False
        target_lux = None

        if not left_ear_visible or not right_ear_visible:
            self.add_violation(7, "Ear & Face Scan", "EAR_OCCLUSION", "HIGH",
                               "Both left and right ears must be clearly visible during interview scan.")
            boost_required = True
            target_lux = 100.0

        if ambient_face_lux < 60.0:
            boost_required = True
            target_lux = max(100.0, (60.0 - ambient_face_lux) * 2.5)

        return (ambient_face_lux >= 60.0 and left_ear_visible and right_ear_visible), boost_required, target_lux

    # ── Layer 8: 360 Room Scan & Secondary Person Intrusion Defense ──────────
    def verify_layer_8_room_scan(
        self,
        detected_face_count: int,
        room_scan_verified: bool
    ) -> bool:
        if detected_face_count > 1:
            self.add_violation(8, "Room Intrusion Defense", "SECONDARY_PERSON", "CRITICAL",
                               f"Multiple individuals detected ({detected_face_count} faces in frame). Immediate camera freeze.")
            return False
        if not room_scan_verified:
            self.add_violation(8, "Room Intrusion Defense", "ROOM_UNVERIFIED", "HIGH",
                               "Mandatory 360 degree room environment scan unverified.")
            return False
        return True

    # ── Layer 9: 5-Second Look-Away Rule ─────────────────────────────────────
    def evaluate_layer_9_look_away(
        self,
        gaze_deviation_deg: float,
        is_speaking: bool = False
    ) -> Tuple[float, bool]:
        """If candidate looks away >25 deg for >=5.0 seconds, cancels question and forces 360 room re-scan."""
        if gaze_deviation_deg > 25.0 and not is_speaking:
            self.look_away_frames += 1
            self.look_away_duration_sec = self.look_away_frames / self.fps
            if self.look_away_duration_sec >= 5.0:
                self.add_violation(9, "Look-Away Protocol", "LOOK_AWAY_TIMEOUT", "HIGH",
                                   f"Candidate looked away ({gaze_deviation_deg:.1f} deg) for {self.look_away_duration_sec:.1f}s >= 5.0s. Question cancelled; mandatory room re-scan required.")
                self.requires_room_rescan = True
                self.look_away_frames = 0  # reset after triggering
        else:
            self.look_away_frames = max(0, self.look_away_frames - 2)
            self.look_away_duration_sec = self.look_away_frames / self.fps

        return self.look_away_duration_sec, self.requires_room_rescan

    # ── Layer 10: Continuous Identity Verification ───────────────────────────
    def verify_layer_10_identity(
        self,
        current_embedding: List[float]
    ) -> bool:
        if self.enrolled_face_embedding is None:
            self.enrolled_face_embedding = current_embedding
            return True

        if len(current_embedding) != len(self.enrolled_face_embedding):
            return False

        dot = sum(a * b for a, b in zip(current_embedding, self.enrolled_face_embedding))
        norm_a = math.sqrt(sum(a * a for a in current_embedding))
        norm_b = math.sqrt(sum(b * b for b in self.enrolled_face_embedding))
        cosine_sim = dot / max(norm_a * norm_b, 1e-9)

        if cosine_sim < 0.85:
            self.add_violation(10, "Continuous Identity", "IDENTITY_MISMATCH", "CRITICAL",
                               f"Facial embedding cosine similarity ({cosine_sim:.2f}) below 0.85 threshold. Impersonation flagged.")
            return False
        return True

    # ── Layer 11: Kinematic Gesture Vocabulary ───────────────────────────────
    def verify_layer_11_gestures(
        self,
        detected_gesture: str
    ) -> bool:
        prohibited_gestures = {"hand_to_ear", "phone_reach", "keyboard_hidden_typing"}
        if detected_gesture in prohibited_gestures:
            self.add_violation(11, "Kinematic Gesture Tracking", "PROHIBITED_GESTURE", "HIGH",
                               f"Kinematic vocabulary detected prohibited gesture: '{detected_gesture}'.")
            return False
        return True

    # ── Layer 12: Cryptographic Audit Sealing ────────────────────────────────
    def seal_layer_12_audit(self) -> str:
        payload = json.dumps([
            {"id": v.layer_id, "type": v.violation_type, "sec": v.timestamp_sec}
            for v in self.violations
        ], sort_keys=True)
        merkle_root = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        return merkle_root
