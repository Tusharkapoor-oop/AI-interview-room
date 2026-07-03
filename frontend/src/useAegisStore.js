/**
 * useAegisStore.js — v4.0
 * Central Zustand store with voice, scoring, session config, and analytics state.
 */
import { create } from 'zustand';

export const useAegisStore = create((set, get) => ({
  // ── STRICTEST PROTOCOL IN THE WORLD (Mandatory Lockdown) ──
  strictMandatoryLockdown: false,
  mandatoryLockdownReason: '',
  triggerMandatoryLockdown: (reason) => set({ strictMandatoryLockdown: true, mandatoryLockdownReason: reason }),
  resetMandatoryLockdown: () => set({ strictMandatoryLockdown: false, mandatoryLockdownReason: '', trustScore: 100 }),

  // ── Phase Management ─────────────────────────────────
  phase: 'landing',
  setPhase: (phase) => set({ phase }),

  // ── Interview Conductor Mode ──────────────────────────
  // 'ai' | 'human' | 'admin' — set from InterviewerModeSelector
  interviewMode: 'ai',
  setInterviewMode: (mode) => set({ interviewMode: mode }),

  // ── Identity Verification (Layer 1) ──────────────────────────────────────
  identityData: null,
  setIdentityData: (data) => set({ identityData: data }),
  identityVerified: false,
  setIdentityVerified: (v) => set({ identityVerified: v }),

  // ── Face Mesh Baseline (2D landmark array for continuous verification) ──
  // Stored as flat array of {x, y} normalized coords from registration selfie
  registeredFaceMesh: null,
  setRegisteredFaceMesh: (mesh) => set({ registeredFaceMesh: mesh }),
  faceMatchScore: 100,
  setFaceMatchScore: (score) => set({ faceMatchScore: score }),

  // ── Camera Permission State ─────────────────────────────────────────────
  cameraPermission: 'unknown', // 'unknown' | 'granted' | 'denied'
  setCameraPermission: (state) => set({ cameraPermission: state }),

  // ── Session Config (from OnboardScreen) ──────────────
  sessionConfig: {
    role:       'software_engineer',
    seniority:  'mid',
    type:       'technical',
    name:       '',
  },
  setSessionConfig: (cfg) => set(s => ({ sessionConfig: { ...s.sessionConfig, ...cfg } })),

  // ── Telemetry ─────────────────────────────────────────
  telemetry: {
    gaze_anomaly: false,
    hands_visible: 0,
    pose: { pitch: 0, yaw: 0, roll: 0 },
    face_detected: false,
    status: 'ok',
  },
  setTelemetry: (t) => set({ telemetry: t }),

  // ── Risk Events (Permanent Forensic Log & Zero-Tolerance Lockdown) ──
  riskEvents: [],
  addRiskEvent: (event) => {
    set((s) => {
      // Modality mappings for late fusion (Problem 5)
      const CHANNELS = {
        'GAZE_ANOMALY': 1, 'GAZE_DEVIATION_ANGLE': 1, 'FIXATION_UNIFORMITY': 1, 'SMOOTH_PURSUIT_DETECTED': 1, 'NO_FACE_DETECTED': 1,
        'HAND_ANOMALY': 2, 'SECONDARY_PERSON': 2,
        'SECONDARY_VOICE_DETECTED': 3, 'TYPING_ANOMALY': 3, 'WHISPER_COACHING_DETECTED': 3, 'TTS_VOICE_DETECTED': 3,
        'SYNTHETIC_INPUT': 4, 'SYNTHETIC_PASTE': 4, 'BURST_TYPING_DETECTED': 4,
        'AI_API_CALL': 5, 'LLM_PHRASEOLOGY_DETECTED': 5
      };

      const now = Date.now();
      const newEvents = [...s.riskEvents, {
        id: now,
        ts: new Date().toLocaleTimeString('en-US', { hour12: false }),
        sessionSec: s.sessionSeconds,
        ...event,
      }];

      // Calculate N active channels in last 10 seconds
      const recentEvents = newEvents.filter(e => now - e.id <= 10000);
      const activeChannels = new Set();
      recentEvents.forEach(e => {
        const ch = CHANNELS[e.type];
        if (ch) activeChannels.add(ch);
      });
      const N = activeChannels.size;

      // Adjust severity based on N-channel late fusion rule
      if (N >= 3) {
        const mergedSeverity = N === 3 ? 'MEDIUM' : N === 4 ? 'HIGH' : 'CRITICAL';
        // Add compound risk event to log
        if (!newEvents.some(e => e.type === 'COMPOUND_RISK' && now - e.id <= 10000)) {
          newEvents.push({
            id: now + 1,
            ts: new Date().toLocaleTimeString('en-US', { hour12: false }),
            sessionSec: s.sessionSeconds,
            type: 'COMPOUND_RISK',
            severity: mergedSeverity,
            desc: `Multi-Modal Late Fusion: ${N}-channel deviation detected (Active channels: ${Array.from(activeChannels).map(ch => `Ch ${ch}`).join(', ')}).`
          });
        }
      }

      // THE STRICTEST PROTOCOL IN THE WORLD: Zero Tolerance
      const ZERO_TOLERANCE_SIGNALS = new Set([
        'VIRTUAL_MACHINE_DETECTED', 'COMPOUND_RISK', 'DEVTOOLS_OPEN',
        'GAZE_READING_PATTERN', 'WHISPER_COACHING_DETECTED', 'TTS_VOICE_DETECTED',
        'EXTENSION_RUNTIME', 'SYNTHETIC_INPUT', 'EXTENSION_DETECTED', 'EXTENSION_GLOBAL',
        'EXTENSION_IFRAME', 'EXTENSION_WORKER', 'AI_API_CALL', 'SYNTHETIC_PASTE', 'NO_FACE_DETECTED'
      ]);

      const isDisqualified = newEvents.length >= 3 || newEvents.some(e => e.severity === 'CRITICAL' || ZERO_TOLERANCE_SIGNALS.has(e.type));
      
      if (isDisqualified && !s.strictMandatoryLockdown) {
        return {
          riskEvents: newEvents,
          strictMandatoryLockdown: true,
          mandatoryLockdownReason: `DEFCON 1 BIOMETRIC BREACH: [${event.type || 'Infraction threshold exceeded'}]. Zero-tolerance protocol enforcement active. Mandatory termination.`,
          phase: 'report',
          toast: { msg: '⛔ MANDATORY TERMINATION: Security protocol infraction confirmed.', type: 'error', duration: 15000 }
        };
      }

      return { riskEvents: newEvents };
    });
    get().updateIntegrityScore();
  },

  // ── Detected Extensions Log ───────────────────────────
  detectedExtensions: [],
  addDetectedExtension: (ext) => set(s => ({
    detectedExtensions: [...s.detectedExtensions, ext]
  })),

  // ── Integrity Score (Strict Threshold < 75%) ──────────
  integrityScore: 100,
  updateIntegrityScore: () => {
    const { riskEvents, strictMandatoryLockdown } = get();
    const penalties = riskEvents.reduce((acc, ev) => {
      if (ev.severity === 'CRITICAL') return acc + 25;
      if (ev.severity === 'HIGH')     return acc + 12;
      if (ev.severity === 'MEDIUM')   return acc + 6;
      return acc + 2;
    }, 0);
    const newScore = Math.max(100 - penalties, 0);
    
    if (newScore < 75 && !strictMandatoryLockdown) {
      set({
        integrityScore: newScore,
        strictMandatoryLockdown: true,
        mandatoryLockdownReason: `INTEGRITY COMPROMISE (Score ${newScore}% < 75% strict threshold). Mandatory terminal enforcement active.`
      });
    } else {
      set({ integrityScore: newScore });
    }
  },

  // ── Session ───────────────────────────────────────────
  sessionSeconds: 0,
  sessionId: null,
  tickSession: () => set((s) => ({ sessionSeconds: s.sessionSeconds + 1 })),
  setSessionId: (id) => set({ sessionId: id }),

  // ── Candidate Info ────────────────────────────────────
  candidateName: 'Alex Johnson',
  setCandidateName: (name) => set({ candidateName: name }),
  candidateNameSet: false,
  markCandidateNameSet: () => set({ candidateNameSet: true }),
  language: 'en',
  setLanguage: (l) => set({ language: l }),

  // ── Ephemeral Toast ───────────────────────────────────
  toast: null,
  showToast: (msg, type = 'warn', duration = 6000) => {
    set({ toast: { msg, type, duration } });
  },
  clearToast: () => set({ toast: null }),

  // ── Ghost View ────────────────────────────────────────
  ghostViewEnabled: false,
  toggleGhostView: () => set((s) => ({ ghostViewEnabled: !s.ghostViewEnabled })),

  // ── Conversation ──────────────────────────────────────
  messages: [],
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  clearMessages: () => set({ messages: [] }),

  // ── HITL Events ───────────────────────────────────────
  hitlEvent: null,
  setHitlEvent: (ev) => set({ hitlEvent: ev }),
  clearHitlEvent: () => set({ hitlEvent: null }),

  // ── Agent Statuses ────────────────────────────────────
  agentStatuses: {
    aria:         'idle',
    cv_agent:     'idle',
    code_review:  'idle',
    bias_agent:   'idle',
    memory_agent: 'idle',
  },
  setAgentStatuses: (s) => set({ agentStatuses: s }),

  // ── Liveness ─────────────────────────────────────────
  livenessPassed: false,
  setLivenessPassed: (v) => set({ livenessPassed: v }),

  // ── Calibration ──────────────────────────────────────
  calibrationProgress: 0,
  setCalibrationProgress: (v) => set({ calibrationProgress: v }),
  calibrationDone: false,
  setCalibrationDone: (v) => set({ calibrationDone: v }),

  // ── Voice / Speech Recognition (v4.0) ────────────────
  voiceActive: false,
  voiceTranscript: '',
  setVoiceActive: (v) => set({ voiceActive: v }),
  setVoiceTranscript: (t) => set({ voiceTranscript: t }),
  appendVoiceTranscript: (chunk) => set(s => ({ voiceTranscript: s.voiceTranscript + ' ' + chunk })),

  // ── AI Speaking state (for avatar mouth sync) ─────────
  aiSpeaking: false,
  setAiSpeaking: (v) => set({ aiSpeaking: v }),

  // ── Interview Question state ──────────────────────────
  currentQuestionDifficulty: 'medium', // easy | medium | hard
  setQuestionDifficulty: (d) => set({ currentQuestionDifficulty: d }),

  // ── Attention heatmap (timeline of gaze quality) ─────
  attentionHistory: [],
  recordAttention: () => set(s => {
    const point = {
      t: s.sessionSeconds,
      ok: !s.telemetry.gaze_anomaly,
      score: s.integrityScore,
    };
    return { attentionHistory: [...s.attentionHistory.slice(-120), point] };
  }),

  // ── Deepfake / Fraud Layer 6 ─────────────────────────────
  deepfakeFlag: false,
  setDeepfakeFlag: (v) => set({ deepfakeFlag: v }),

  // ── Emotion heuristics (derived, not biometric) ───────────
  emotionState: 'neutral', // neutral | confident | anxious | focused
  setEmotionState: (e) => set({ emotionState: e }),

  // ── Hand Gesture Metrics ──────────────────────────────────
  gestureMetrics: { hand_anomaly_type: null, hands_visible: 0 },
  setGestureMetrics: (metrics) => set(s => ({
    gestureMetrics: { ...s.gestureMetrics, ...metrics }
  })),

  // ── Accommodations & Relaxed Proctoring (US-05) ────────────
  accommodationRequested: false,
  setAccommodationRequested: (v) => set({ accommodationRequested: v }),
  relaxedProctoringEnabled: false,
  setRelaxedProctoringEnabled: (v) => set({ relaxedProctoringEnabled: v }),

  // ── rPPG — Remote Photoplethysmography (Paper §rPPG) ─────────────
  // Heart-rate extracted from webcam skin-color micro-variations via DFT.
  rppgData: {
    bpm: null, snr: 0, isLive: null,
    signalStrength: 0, status: 'initializing', sampleCount: 0,
  },
  setRppgData: (d) => set({ rppgData: d }),

  // ── PLR — Pupillary Light Reflex (Paper §PLR) ────────────────────
  // True after candidate passes the active screen-flash PLR liveness check.
  plrPassed: null,   // null = not run, true = passed, false = failed
  setPlrPassed: (v) => set({ plrPassed: v }),

  // ── Speaker Verification (Paper §Audio Forensics) ────────────────
  // 13-bin spectral MFCC-proxy enrolled during calibration.
  voiceProfile: null,          // Float32Array serialized as plain array
  setVoiceProfile: (p) => set({ voiceProfile: p }),

  // Live cosine-similarity match score (0–100) vs. enrolled voice profile.
  speakerMatchScore: null,
  setSpeakerMatchScore: (s) => set({ speakerMatchScore: s }),
}));

