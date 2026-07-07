/**
 * useAegisStore.js — v4.0
 * Central Zustand store with voice, scoring, session config, and analytics state.
 */
import { create } from 'zustand';

export const useAegisStore = create((set, get) => ({
  // ── STRICTEST PROTOCOL IN THE WORLD (Mandatory Lockdown) ──
  strictMandatoryLockdown: false,
  mandatoryLockdownReason: '',
  _lockdownFired: false,
  triggerMandatoryLockdown: (reason) => set({ strictMandatoryLockdown: true, mandatoryLockdownReason: reason, _lockdownFired: true }),
  resetMandatoryLockdown: () => set({ strictMandatoryLockdown: false, mandatoryLockdownReason: '', _lockdownFired: false }),

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
  setTelemetry: (t) => set({
    telemetry: {
      gaze_anomaly: false,
      hands_visible: 0,
      pose: { pitch: 0, yaw: 0, roll: 0 },
      face_detected: false,
      status: 'ok',
      ...t,
      pose: { pitch: 0, yaw: 0, roll: 0, ...(t?.pose || {}) },
    }
  }),

  // ── Risk Events (Forensic Log — Server-Authoritative Lockdown) ──
  riskEvents: [],
  addRiskEvent: (event) => {
    set((s) => {
      const MAX_RISK_EVENTS = 500;
      const newEvents = [...s.riskEvents, {
        id: Date.now(),
        ts: new Date().toLocaleTimeString('en-US', { hour12: false }),
        sessionSec: s.sessionSeconds,
        ...event,
      }];
      if (newEvents.length > MAX_RISK_EVENTS) {
        newEvents.splice(0, newEvents.length - MAX_RISK_EVENTS);
      }
      return { riskEvents: newEvents };
    });
  },

  // ── Detected Extensions Log ───────────────────────────
  detectedExtensions: [],
  addDetectedExtension: (ext) => set(s => ({
    detectedExtensions: [...s.detectedExtensions, ext]
  })),

  // ── Integrity Score (Server Authoritative) ──────────
  integrityScore: 100,
  setServerIntegrityScore: (score) => {
    const { strictMandatoryLockdown, _lockdownFired } = get();
    if (_lockdownFired) return;
    const clamped = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
    if (clamped < 40 && !strictMandatoryLockdown) {
      set({
        integrityScore: clamped,
        _lockdownFired: true,
        strictMandatoryLockdown: true,
        mandatoryLockdownReason: `INTEGRITY COMPROMISE (Server Authoritative Score ${clamped}% < 40% strict threshold).`
      });
    } else {
      set({ integrityScore: clamped });
    }
  },
  updateIntegrityScore: () => {
    // DEPRECATED — client-side scoring is no-op (H-6).
    // Integrity score is strictly authoritative from server (setServerIntegrityScore).
    // Callers will be refactored in a future pass; this shim prevents breakage.
    if (import.meta.env.DEV) {
      console.warn('[deprecated] updateIntegrityScore() called — no-op in production. Use setServerIntegrityScore().');
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

  // ── Gaze Entropy (L-13: store, not window global) ───
  gazeEntropy: null,
  setGazeEntropy: (v) => set({ gazeEntropy: v }),

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

  // Internal camera stream (not window global)
  _cameraStream: null,
  _setCameraStream: (s) => set({ _cameraStream: s }),
}));

// Camera stream stored in Zustand (not window global) — SSR-safe, race-condition-free
let _cameraStreamPromise = null;

export async function getGlobalCameraStream() {
  const existing = useAegisStore.getState()._cameraStream;
  if (existing && existing.active) {
    return existing;
  }
  if (_cameraStreamPromise) {
    try {
      const resolved = await _cameraStreamPromise;
      if (resolved && resolved.active) {
        return resolved;
      }
    } catch (e) {
      // Ignore error and re-acquire
    }
    _cameraStreamPromise = null;
  }
  _cameraStreamPromise = (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false
      });
      useAegisStore.getState()._setCameraStream(stream);
      return stream;
    } catch (err) {
      _cameraStreamPromise = null;
      throw err;
    }
  })();
  return _cameraStreamPromise;
}

export function stopGlobalCameraStream() {
  const stream = useAegisStore.getState()._cameraStream;
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    useAegisStore.getState()._setCameraStream(null);
  }
  _cameraStreamPromise = null;
}

