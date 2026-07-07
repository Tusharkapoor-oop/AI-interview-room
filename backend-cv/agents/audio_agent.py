"""
agents/audio_agent.py — AudioAgent Spoke (v6.0)

Paper 2 §"Voice Biometrics" + §"Ghost Writer Assistance":
  - Voiceprint consistency monitoring (pitch, tone, speech patterns)
  - Secondary voice / coaching detection
  - Ghost writer earpiece heuristics (overlapping formants)
  - Speech rate anomaly (too slow = reading, too fast = AI-generated)
  - Silence pattern analysis (coached pauses)
  - Audio prosody features (Librosa-style)

Paper 3 §"Multi-Modal Fraud Detection":
  - Voice clone detection (frequency band regularity)
  - Cross-modal verification with visual signals
"""
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

log = logging.getLogger("aegis.audio_agent")

# ── Normal speech parameters ─────────────────────────────────────
NORMAL_SPEECH_RATE_WPM = (100, 200)   # words per minute range
NORMAL_PITCH_HZ        = (80, 400)    # fundamental frequency range
SILENCE_GAP_WARN_S     = 30.0         # more than 30s silence = suspicious
COACHING_GAP_S         = 3.0          # regular gaps of 3s = coached pauses
VOICE_CONSISTENCY_THRESH = 0.35       # max allowed deviation from enrolled voiceprint


@dataclass
class AudioEvent:
    session_id:   str
    event_type:   str
    severity:     str
    description:  str
    confidence:   float = 0.8
    audio_feature: dict = field(default_factory=dict)
    fraud_signal: bool = False
    timestamp:    str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class AudioAgent:
    """
    Spoke agent: Audio Analysis specialist.

    Implements:
      Paper §4.3 Voice Biometrics  → pitch, tone, speech patterns, voiceprint
      Paper §3.3 Hidden Assistance → secondary voice, coaching patterns
      Paper §3.4 Generative AI     → speech rate anomaly for AI-read answers
      Paper §6   Advanced          → multi-speaker detection, formant analysis
    """

    def __init__(self, session_id: str, enrolled_voiceprint: Optional[dict] = None):
        self.session_id = session_id
        self.enrolled   = enrolled_voiceprint  # baseline from enrollment

        # State tracking
        self._speech_segments: list[dict] = []
        self._silence_start: Optional[float] = None
        self._coaching_gaps: list[float] = []
        self._events_emitted: list[AudioEvent] = []
        self._speaker_count_history: list[int] = []

        log.info("[AudioAgent] Initialized for session %s", session_id)

    def process_segment(self, audio_features: dict) -> Optional[AudioEvent]:
        """
        Process one audio segment (typically 1-2 second window).

        audio_features dict:
          - speaking: bool
          - speech_rate_wpm: float
          - fundamental_freq: float       # F0 / pitch in Hz
          - energy: float                 # RMS energy (0-1)
          - speaker_count: int            # estimated number of speakers
          - pitch_variance: float         # std dev of pitch
          - formant_regularity: float     # 0=natural, 1=synthetic
          - segment_start_ts: float       # unix timestamp
        """
        ts = audio_features.get("segment_start_ts", datetime.now(timezone.utc).timestamp())
        speaking = audio_features.get("speaking", False)
        energy   = audio_features.get("energy", 0.0)

        events = []

        # ── 1. Silence monitoring ─────────────────────────────────
        if not speaking and energy < 0.01:
            if self._silence_start is None:
                self._silence_start = ts
            else:
                silence_dur = ts - self._silence_start
                if silence_dur > SILENCE_GAP_WARN_S:
                    ev = AudioEvent(
                        session_id   = self.session_id,
                        event_type   = "EXTENDED_SILENCE",
                        severity     = "MEDIUM",
                        description  = f"Extended silence: {silence_dur:.0f}s detected. Candidate may have left or is receiving instructions.",
                        confidence   = 0.65,
                        audio_feature = {"silence_duration": silence_dur},
                    )
                    events.append(ev)
                    self._silence_start = None
        else:
            self._silence_start = None

        if not speaking:
            return self._best_event(events)

        # ── 2. Coaching pause detection ───────────────────────────
        # Coached candidates often respond after regular fixed pauses
        if len(self._speech_segments) > 0:
            prev_ts = self._speech_segments[-1].get("segment_start_ts", ts)
            gap = ts - prev_ts
            self._coaching_gaps.append(gap)
            if not (COACHING_GAP_S * 0.7 <= gap <= COACHING_GAP_S * 1.4):
                self._coaching_gaps.pop()

            if len(self._coaching_gaps) >= 5:
                ev = AudioEvent(
                    session_id   = self.session_id,
                    event_type   = "COACHING_PATTERN",
                    severity     = "HIGH",
                    description  = f"Regular speech-pause cadence detected ({len(self._coaching_gaps)} occurrences, avg gap {sum(self._coaching_gaps)/len(self._coaching_gaps):.1f}s). Consistent with coached earpiece assistance.",
                    confidence   = min(len(self._coaching_gaps) / 8, 1.0),
                    fraud_signal = True,
                    audio_feature = {"gap_count": len(self._coaching_gaps), "avg_gap": sum(self._coaching_gaps)/len(self._coaching_gaps)},
                )
                events.append(ev)
                self._coaching_gaps = []

        self._speech_segments.append(audio_features)
        if len(self._speech_segments) > 500:
            self._speech_segments.pop(0)

        # ── 3. Speech rate anomaly ────────────────────────────────
        rate = audio_features.get("speech_rate_wpm", 140)
        if rate > 250:
            ev = AudioEvent(
                session_id   = self.session_id,
                event_type   = "SPEECH_RATE_ANOMALY",
                severity     = "MEDIUM",
                description  = f"Very fast speech: {rate:.0f} WPM (normal: 100-200). Possible AI-generated text being read aloud.",
                confidence   = min((rate - 250) / 100, 0.9),
                audio_feature = {"speech_rate_wpm": rate},
                fraud_signal = True,
            )
            events.append(ev)
        elif rate < 60:
            ev = AudioEvent(
                session_id   = self.session_id,
                event_type   = "SPEECH_RATE_ANOMALY",
                severity     = "LOW",
                description  = f"Slow speech: {rate:.0f} WPM. Possible reading from notes or received coaching.",
                confidence   = 0.55,
                audio_feature = {"speech_rate_wpm": rate},
            )
            events.append(ev)

        # ── 4. Multi-speaker detection ────────────────────────────
        speaker_count = audio_features.get("speaker_count", 1)
        self._speaker_count_history.append(speaker_count)
        if len(self._speaker_count_history) > 30:
            self._speaker_count_history.pop(0)

        recent_multi = sum(1 for s in self._speaker_count_history if s > 1)
        if recent_multi >= 5:  # 5+ windows with multiple speakers
            ev = AudioEvent(
                session_id   = self.session_id,
                event_type   = "SECONDARY_VOICE_DETECTED",
                severity     = "HIGH",
                description  = f"Secondary voice detected in {recent_multi} audio windows. Possible off-screen assistant or earpiece coaching.",
                confidence   = recent_multi / 30,
                fraud_signal = True,
                audio_feature = {"multi_speaker_windows": recent_multi},
            )
            events.append(ev)
            self._speaker_count_history = []

        # ── 5. Voice clone detection ──────────────────────────────
        # Paper §3.2: voice cloning attacks. Cloned voice has unnaturally
        # regular pitch variance and formant structure.
        formant_reg = audio_features.get("formant_regularity", 0.0)
        if formant_reg > 0.75:
            ev = AudioEvent(
                session_id   = self.session_id,
                event_type   = "VOICE_CLONE_SUSPECTED",
                severity     = "CRITICAL",
                description  = f"Voice formant regularity too high ({formant_reg:.2f}) — synthetic speech pattern. Possible voice clone or TTS system.",
                confidence   = formant_reg,
                fraud_signal = True,
                audio_feature = {"formant_regularity": formant_reg},
            )
            events.append(ev)

        # ── 6. Voiceprint consistency ─────────────────────────────
        if self.enrolled:
            current_f0 = audio_features.get("fundamental_freq", 0)
            enrolled_f0 = self.enrolled.get("fundamental_freq", current_f0)
            if enrolled_f0 > 0:
                deviation = abs(current_f0 - enrolled_f0) / enrolled_f0
                if deviation > VOICE_CONSISTENCY_THRESH:
                    ev = AudioEvent(
                        session_id   = self.session_id,
                        event_type   = "VOICEPRINT_MISMATCH",
                        severity     = "HIGH",
                        description  = f"Voice pitch deviation from enrolled baseline: {deviation:.0%} (threshold: {VOICE_CONSISTENCY_THRESH:.0%}). Possible different speaker.",
                        confidence   = min(deviation, 1.0),
                        fraud_signal = True,
                        audio_feature = {"enrolled_f0": enrolled_f0, "current_f0": current_f0, "deviation": deviation},
                    )
                    events.append(ev)

        if events:
            best = self._best_event(events)
            self._events_emitted.append(best)
            log.warning("[AudioAgent] %s %s", best.severity, best.event_type)
            return best
        return None

    def _best_event(self, events: list) -> Optional[AudioEvent]:
        if not events:
            return None
        order = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}
        return max(events, key=lambda e: order.get(e.severity, 0))

    def summary(self) -> dict:
        fraud_events = [e for e in self._events_emitted if e.fraud_signal]
        return {
            "session_id":      self.session_id,
            "total_segments":  len(self._speech_segments),
            "total_events":    len(self._events_emitted),
            "fraud_events":    len(fraud_events),
            "coaching_gaps_detected": len(self._coaching_gaps),
        }
