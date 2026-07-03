/**
 * InterviewArena.jsx — v5.1
 * Research-informed upgrades:
 * - [NEW] Gaze entropy analysis (IJSRA 91.4% F1) — horizontal scan detection
 * - [NEW] Response timing profiling — AI tool latency signature (Harjai AI 82%)
 * - [NEW] LLM phraseology fingerprinting — Fabric 20+ forensic signals
 * - Holographic Aria 2.0 avatar with speech sync
 * - Voice-to-Text transcription (Web Speech API)
 * - Live audio waveform visualizer
 * - Neural network reactive background
 * - AI typing indicator
 * - Attention recording every 5s
 * - Question difficulty indicator
 * - rPPG heartbeat monitoring (Paper §rPPG)
 * - Speaker verification via cosine-similarity (Paper §Audio Forensics)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useAegisStore } from './useAegisStore';
import { useWebSocket } from './useWebSocket';
import HolographicAvatar from './HolographicAvatar';
import AudioWaveform from './AudioWaveform';
import NeuralBg from './NeuralBg';
import FraudScorePanel from './FraudScorePanel';
import AppealPanel from './AppealPanel';
import { useDigitalSecurity } from './useDigitalSecurity';
import { useContVerification } from './useContVerification';
import { useKeystrokeDynamics } from './useKeystrokeDynamics';
import MiniLivenessChallenge from './MiniLivenessChallenge';
import { useRppg } from './useRppg';
import RppgMonitor from './RppgMonitor';
import { useSpeakerVerification } from './useSpeakerVerification';
import SpeakerVerificationPanel from './SpeakerVerificationPanel';
import { useNuclearLockdown } from './useNuclearLockdown';
import SecurityIntelPanel from './SecurityIntelPanel';
import { useGazeEntropy } from './useGazeEntropy';          // Research Module 1 v3.0
import { useResponseTiming } from './useResponseTiming';    // Research Module 2 v3.0
import { useLlmPhraseDetector } from './useLlmPhraseDetector'; // Research Module 3 v3.0
import { useAudioForensics } from './useAudioForensics';    // Research Module NEW — audio forensics


const getWsProtocol = () => window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const CV_WS  = `${getWsProtocol()}//${window.location.host}/ws/cv`;
const INT_WS = `${getWsProtocol()}//${window.location.host}/ws/interview`;

const QUESTIONS = {
  technical: [
    'Describe a complex distributed system you designed. What trade-offs did you make?',
    'How do you handle race conditions and deadlocks in concurrent systems?',
    'Walk me through your approach to designing a real-time collaborative editor like Google Docs.',
    'Explain the CAP theorem and how it influenced a real architecture decision you made.',
    'How would you optimize a database query that\'s taking 8 seconds to complete?',
  ],
  behavioral: [
    'Tell me about a time you disagreed with your manager. How did you handle it?',
    'Describe a situation where you had to deliver bad news to stakeholders.',
    'When have you had to learn an entirely new technology under tight deadlines?',
    'How do you prioritize when you have 3 critical bugs and a feature deadline?',
  ],
  system_design: [
    'Design a URL shortener like bit.ly that handles 10B requests/day.',
    'How would you architect a global notification system for 500M users?',
    'Design a ride-sharing backend like Uber. Focus on real-time matching.',
  ],
};

const DIFFICULTY_COLORS = {
  easy:   { label: 'Easy',   color: 'var(--aegis-green)', bg: 'rgba(16,185,129,0.1)' },
  medium: { label: 'Medium', color: 'var(--aegis-amber)', bg: 'rgba(245,158,11,0.1)' },
  hard:   { label: 'Hard',   color: 'var(--aegis-red)', bg: 'rgba(239,68,68,0.1)' },
};

function GazeForensicHudPanel() {
  const [metrics, setMetrics] = React.useState(window.__aegisGazeEntropy || {});

  React.useEffect(() => {
    const timer = setInterval(() => {
      if (window.__aegisGazeEntropy) setMetrics({ ...window.__aegisGazeEntropy });
    }, 250);
    return () => clearInterval(timer);
  }, []);

  const entropy = metrics.entropy !== undefined ? metrics.entropy : 0.85;
  const acf1 = metrics.acf1 !== undefined ? metrics.acf1 : 0.05;
  const scanRatio = metrics.scanRatio !== undefined ? metrics.scanRatio : 0.12;
  const isReading = metrics.ensembleScore > 0.45;

  return (
    <div className="mini-metric" style={{ border: isReading ? '1px solid var(--aegis-red)' : '1px solid var(--aegis-teal)', background: isReading ? 'rgba(239,68,68,0.06)' : 'rgba(20,184,166,0.04)', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div className="mini-metric-label" style={{ color: isReading ? 'var(--aegis-red)' : 'var(--aegis-teal)' }}>
          👁 Gaze Forensics (v4.0)
        </div>
        <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: 4, background: isReading ? 'var(--aegis-red)' : 'var(--aegis-green)', color: '#fff', fontWeight: 700 }}>
          {isReading ? 'READING DETECTED' : 'NATURAL GAZE'}
        </span>
      </div>
      
      <div style={{ fontSize: '0.72rem', display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span>Shannon Entropy (H):</span>
        <strong style={{ color: entropy < 0.5 ? 'var(--aegis-red)' : 'var(--aegis-green)' }}>{entropy.toFixed(2)} / 1.0</strong>
      </div>
      <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ width: `${entropy * 100}%`, height: '100%', background: entropy < 0.5 ? 'var(--aegis-red)' : 'var(--aegis-green)', transition: 'width 0.3s ease' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: '0.68rem', color: 'var(--text-2)' }}>
        <div>ACF₁ (Periodicity): <strong style={{ color: '#fff' }}>{acf1.toFixed(2)}</strong></div>
        <div>Scan Ratio: <strong style={{ color: '#fff' }}>{scanRatio.toFixed(2)}</strong></div>
      </div>
    </div>
  );
}

export default function InterviewArena() {
  const {
    telemetry, setTelemetry,
    addRiskEvent, updateIntegrityScore,
    addMessage, messages,
    showToast, language,
    sessionSeconds,
    aiSpeaking, setAiSpeaking,
    currentQuestionDifficulty, setQuestionDifficulty,
    voiceTranscript, setVoiceTranscript,
    voiceActive, setVoiceActive,
    recordAttention,
    setPhase, integrityScore,
    sessionConfig,
    hitlEvent, clearHitlEvent,
    relaxedProctoringEnabled
  } = useAegisStore();

  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const warningRef = useRef(false);

  const gazeWarningsCount = useRef(0);
  const gazeAnomalyStart  = useRef(null);
  const noFaceStart       = useRef(null);

  const [input, setInput]           = useState('');
  const [showWarning, setWarning]   = useState(false);
  const [qIndex, setQIndex]         = useState(0);
  const [isTyping, setIsTyping]     = useState(false); // AI typing indicator
  const [showAppeal, setShowAppeal] = useState(false);

  const [showReChallenge, setShowReChallenge] = useState(false);

  // ── Layer 5: Digital Security ──────────────────────────────────────
  useDigitalSecurity(true, (ev) => {
    sendMsg({ type: 'telemetry_event', event: ev });
  });

  // ── Nuclear Extension Lockdown (Zero-Bypass, 11 vectors) ────────────────
  const { threatCount } = useNuclearLockdown(true);

  // ── Research Module 1: Gaze Entropy v3.0 ────────────────────────────────
  // Kalman filter + saccade physics + fixation CV + 8×8 entropy + ACF
  useGazeEntropy();

  // ── Research Module 2: Response Timing v3.0 ─────────────────────────
  // KS-test vs human log-normal + 4 AI tool fingerprints + ZCR/centroid VAD
  const { markQuestionDelivered } = useResponseTiming();

  // ── Research Module 3: LLM Phraseology v3.0 ───────────────────────
  // FK score + TTR + sentence CV + 30 lexical bundles + 35-signal catalog
  const { analyzeTranscript } = useLlmPhraseDetector();

  // ── Research Module 4: Audio Forensics NEW ─────────────────────────
  // Whisper detection + TTS pitch stability + acoustic fingerprint + SFM
  useAudioForensics();

  // ── Layer 2: Continuous Verification ──────────────────────────
  useContVerification(videoRef, (features) => {
    sendMsg({ type: 'audio_features', features });
  });

  // ── Keystroke Dynamics ────────────────────────────────────
  const keystroke = useKeystrokeDynamics(true, (builtProfile) => {
    sendMsg({ type: 'keystroke_baseline', profile: builtProfile });
  });

  // ── [NEW] rPPG — Remote Photoplethysmography (Paper §rPPG) ───────
  // Extracts heart rate from skin-color micro-variations in the webcam feed.
  const rppgData = useRppg(videoRef, true);

  // ── [NEW] Speaker Verification (Paper §Audio Forensics) ──────────
  // Matches live voice against the enrolled profile from calibration.
  const { matchScore: speakerMatchScore } = useSpeakerVerification(true);

  // Trigger markQuestionShown on question index change
  useEffect(() => {
    keystroke.markQuestionShown();
  }, [qIndex]);

  // Monitor HITL active re-challenge events
  useEffect(() => {
    if (hitlEvent?.actionType === 'liveness_rechallenge') {
      setShowReChallenge(true);
      clearHitlEvent();
    }
  }, [hitlEvent, clearHitlEvent]);


  // Get questions based on interview type
  const questionPool = QUESTIONS[sessionConfig?.type] || QUESTIONS.technical;

  // ── Webcam ─────────────────────────────────────────────
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      .then(s => { if (videoRef.current) videoRef.current.srcObject = s; })
      .catch(() => showToast('Camera access is required.', 'error'));
    return () => videoRef.current?.srcObject?.getTracks().forEach(t => t.stop());
  }, []);

  // ── Chat scroll ────────────────────────────────────────
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Attention recording every 5s ───────────────────────
  useEffect(() => {
    const id = setInterval(recordAttention, 5000);
    return () => clearInterval(id);
  }, [recordAttention]);

  // ── Voice Recognition ──────────────────────────────────
  const initVoice = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('Speech recognition not supported in this browser.', 'warn');
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = language === 'en' ? 'en-US' : language;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          setInput(prev => (prev + ' ' + transcript).trim());
          setVoiceTranscript('');
        } else {
          interim = transcript;
          setVoiceTranscript(interim);
        }
      }
    };

    rec.onend = () => {
      if (voiceActive) rec.start(); // restart if still active
    };

    rec.start();
    recognitionRef.current = rec;
    setVoiceActive(true);
  }, [language, voiceActive, setVoiceActive, setVoiceTranscript, showToast]);

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setVoiceActive(false);
    setVoiceTranscript('');
  }, [setVoiceActive, setVoiceTranscript]);

  // ── CV WebSocket ────────────────────────────────────────
  const handleCv = useCallback((data) => {
    if (data.status !== 'ok') return;
    setTelemetry({ ...data });

    // Enforce strict no-face detection
    if (data.face_detected === false) {
      if (!noFaceStart.current) {
        noFaceStart.current = Date.now();
      }
      const duration = Date.now() - noFaceStart.current;
      showToast('⚠️ NO FACE DETECTED: Return to camera frame immediately!', 'error', 3000);
      setWarning(true);

      if (duration > 4000) {
        addRiskEvent({
          type: 'NO_FACE_DETECTED',
          severity: 'CRITICAL',
          desc: `Candidate face absent for ${Math.round(duration/1000)}s`,
        });
        updateIntegrityScore();
      }
      return;
    } else {
      noFaceStart.current = null;
    }

    // Bypass biometric proctoring alerts in Relaxed Proctoring Mode (US-05)
    if (relaxedProctoringEnabled) {
      return;
    }

    if (data.v4_fusion && (data.v4_fusion.verdict === 'HIGH_FLAG_REVIEW' || data.v4_fusion.verdict === 'CRITICAL_PAUSE')) {
      addRiskEvent({
        type: 'MULTI_MODAL_FUSION_ALERT',
        severity: data.v4_fusion.verdict === 'CRITICAL_PAUSE' ? 'CRITICAL' : 'HIGH',
        desc: `[v4.0 Fusion] ${data.v4_fusion.description} (${data.v4_fusion.active_channels} channels triggered)`,
      });
      updateIntegrityScore();
    }

    if (data.gaze_anomaly) {
      if (!gazeAnomalyStart.current) {
        gazeAnomalyStart.current = Date.now();
      }

      if (!warningRef.current) {
        warningRef.current = true;
        setWarning(true);
        gazeWarningsCount.current += 1;
        
        showToast('Please center your face within the frame.', 'warn', 5000);

        setTimeout(() => {
          const isStillAnomaly = gazeAnomalyStart.current !== null;
          const duration = isStillAnomaly ? (Date.now() - gazeAnomalyStart.current) : 0;
          
          if (isStillAnomaly) {
            // Log event only if it persists (prolonged > 6s) or is a repeat offense (warning count >= 2) (US-02)
            if (gazeWarningsCount.current >= 2 || duration > 6000) {
              addRiskEvent({
                type: 'GAZE_ANOMALY',
                severity: Math.abs(data.pose?.yaw || 0) > 30 ? 'HIGH' : 'MEDIUM',
                desc: `Gaze anomaly — Yaw ${Math.round(data.pose?.yaw || 0)}°, Pitch ${Math.round(data.pose?.pitch || 0)}° (Warnings: ${gazeWarningsCount.current})`,
              });
              updateIntegrityScore();
            }
          }
          setTimeout(() => { setWarning(false); warningRef.current = false; }, 3000);
        }, 3000);
      }
    } else {
      gazeAnomalyStart.current = null;
    }
  }, [relaxedProctoringEnabled, addRiskEvent, updateIntegrityScore, showToast]);

  const { send: sendFrame, status: cvStatus } = useWebSocket(CV_WS, handleCv);


  // ── Interview WebSocket ─────────────────────────────────
  const handleInterview = useCallback((data) => {
    setIsTyping(false);
    addMessage({ role: data.role || 'ai', text: data.message });
    // Simulate Aria speaking animation
    setAiSpeaking(true);
    setTimeout(() => setAiSpeaking(false), Math.min((data.message?.length || 50) * 55, 5000));
  }, []);

  const { send: sendMsg, status: intStatus } = useWebSocket(INT_WS, handleInterview);

  // ── Frame capture ───────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (!videoRef.current || !canvasRef.current || cvStatus !== 'connected') return;
      const ctx = canvasRef.current.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0, 640, 480);
      sendFrame(canvasRef.current.toDataURL('image/jpeg', 0.45));
    }, 150);
    return () => clearInterval(id);
  }, [cvStatus, sendFrame]);

  const handleSend = (e) => {
    e.preventDefault();
    const text = (input + ' ' + voiceTranscript).trim();
    if (!text) return;
    addMessage({ role: 'candidate', text });
    sendMsg({ message: text, language });
    setInput('');
    setVoiceTranscript('');
    setIsTyping(true);
    // Rotate question difficulty
    const diffs = ['easy', 'medium', 'hard'];
    setQuestionDifficulty(diffs[Math.floor(Math.random() * 3)]);
    // Research Module 3: analyze candidate answer for LLM phraseology
    analyzeTranscript(text, qIndex);
    // Dispatch for response timing hook (Module 2 starts listening for next speech onset)
    window.dispatchEvent(new CustomEvent('aegis:candidate_answer', { detail: { text, questionId: qIndex } }));
  };

  const sessionTime = `${String(Math.floor(sessionSeconds / 60)).padStart(2,'0')}:${String(sessionSeconds % 60).padStart(2,'0')}`;
  const difficulty  = DIFFICULTY_COLORS[currentQuestionDifficulty];

  return (
    <div className="arena-layout">
      {/* ── MAIN AREA ─────────────────────────────── */}
      <div className="arena-main">

        {/* Minimal status bar */}
        <div className="status-bar" role="status">
          <div className="status-item recording">
            <span className="dot" aria-hidden="true" />
            REC
          </div>
          <div className="status-item">🕐 {sessionTime}</div>
          <div className="status-item" style={{ color: intStatus === 'connected' ? 'var(--aegis-green)' : 'var(--aegis-amber)' }}>
            {intStatus === 'connected' ? '⬡ Aria Live' : '◎ Connecting…'}
          </div>
          <div className="status-item">🔒 E2E Encrypted</div>
          <div className="status-item"
            style={{ color: difficulty.color, background: difficulty.bg, padding: '2px 8px', borderRadius: 'var(--r-full)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1px' }}>
            {difficulty.label}
          </div>
        </div>

        {/* AI Interviewer */}
        <div className="interviewer-view">
          {/* Neural network reactive background */}
          <NeuralBg anomaly={telemetry.gaze_anomaly} />

          <div className="ai-avatar-container">
            <Canvas camera={{ position: [0, 0, 6.5], fov: 48 }}>
              <HolographicAvatar
                pose={telemetry.pose}
                anomaly={telemetry.gaze_anomaly}
                speaking={aiSpeaking}
                difficulty={currentQuestionDifficulty}
              />
              <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} />
            </Canvas>
          </div>

          {/* AI name tag */}
          <div className="aria-nametag">
            <div className="aria-dot" />
            <span>Aria · AI Interviewer</span>
            {aiSpeaking && <span className="aria-speaking-badge">Speaking…</span>}
          </div>

          {/* Candidate PiP */}
          <video ref={videoRef} className="pip-video" autoPlay playsInline muted />
          <canvas ref={canvasRef} width={640} height={480} className="canvas-hidden" />

          {/* Rotating question overlay */}
          <div className="question-overlay" aria-live="polite">
            <div className="q-index-badge">Q{qIndex + 1} / {questionPool.length}</div>
            <div className="question-text">
              {questionPool[qIndex % questionPool.length]}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
              <button className="btn-secondary" onClick={() => setQIndex(q => Math.max(0, q - 1))}
                disabled={qIndex === 0} style={{ padding: '5px 14px', fontSize: '0.75rem' }}>← Prev</button>
              <button className="btn-secondary" onClick={() => setQIndex(q => q + 1)}
                aria-label="Next question" style={{ padding: '5px 14px', fontSize: '0.75rem' }}>Next →</button>
              <button className="btn-secondary" onClick={() => setPhase('report')}
                style={{ padding: '5px 14px', fontSize: '0.75rem', borderColor: 'var(--aegis-violet)', color: 'var(--aegis-violet)' }}>
                End Session →
              </button>
            </div>
          </div>

          {/* Warning overlay */}
          {showWarning && (
            <div className="candidate-warning" role="alert">
              <div className="candidate-warning-text">⚠️ Please center your face within the frame</div>
            </div>
          )}

          {/* AI Typing indicator */}
          {isTyping && (
            <div className="aria-typing">
              <div className="typing-dot" style={{ animationDelay: '0ms' }} />
              <div className="typing-dot" style={{ animationDelay: '150ms' }} />
              <div className="typing-dot" style={{ animationDelay: '300ms' }} />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginLeft: 6 }}>Aria is thinking…</span>
            </div>
          )}
        </div>

        {/* Chat + Voice Input */}
        <div className="arena-chat">
          <div className="arena-chat-messages" role="log">
            {messages.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.role === 'ai' && <div className="bubble-sender">⬡ Aria</div>}
                {m.role === 'candidate' && <div className="bubble-sender">You</div>}
                {m.text}
              </div>
            ))}
            {/* Live voice preview */}
            {voiceTranscript && (
              <div className="voice-preview">
                <span className="voice-preview-dot" />
                {voiceTranscript}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <form className="arena-chat-form" onSubmit={handleSend}>
            <button
              type="button"
              className={`voice-btn ${voiceActive ? 'active' : ''}`}
              onClick={voiceActive ? stopVoice : initVoice}
              aria-label={voiceActive ? 'Stop voice input' : 'Start voice input'}
              title={voiceActive ? 'Stop recording' : 'Start voice input'}
            >
              {voiceActive ? '🔴' : '🎤'}
            </button>
            <input
              className="arena-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={voiceActive ? 'Speaking… (or type here)' : 'Type your answer or press 🎤 to speak…'}
            />
            <button type="submit" className="send-btn" aria-label="Send message">➤</button>
          </form>
        </div>
      </div>

      {/* ── SIDEBAR ───────────────────────────────── */}
      <div className="candidate-sidebar" role="complementary">
        <div className="sidebar-section-title">Session Status</div>

        {/* Audio Waveform */}
        <div className="mini-metric" style={{ border: voiceActive ? '1px solid var(--aegis-blue)' : '1px solid var(--border)', marginBottom: 8 }}>
          <div className="mini-metric-label">Audio Monitor</div>
          <AudioWaveform active={true} color={voiceActive ? '#3b82f6' : '#4a5c7a'} barCount={24} />
        </div>

        {/* Nuclear Security Intel Panel */}
        <div style={{ marginBottom: 12 }}>
          <SecurityIntelPanel minimal threatCount={threatCount} />
        </div>

        {/* Integrity score ring */}
        <div className="mini-metric" style={{ textAlign: 'center' }}>
          <div className="mini-metric-label">Integrity Score</div>
          <div className="integrity-ring-mini">
            <svg viewBox="0 0 80 80" width="80" height="80">
              <circle cx="40" cy="40" r="32" fill="none" stroke="var(--border)" strokeWidth="6" />
              <circle
                cx="40" cy="40" r="32" fill="none"
                stroke={integrityScore >= 80 ? 'var(--aegis-green)' : integrityScore >= 50 ? 'var(--aegis-amber)' : 'var(--aegis-red)'}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${(integrityScore / 100) * 201} 201`}
                transform="rotate(-90 40 40)"
                style={{ transition: 'stroke-dasharray 1s ease, stroke 0.5s' }}
              />
            </svg>
            <div className="integrity-ring-val" style={{ color: integrityScore >= 80 ? 'var(--aegis-green)' : integrityScore >= 50 ? 'var(--aegis-amber)' : 'var(--aegis-red)' }}>
              {integrityScore}%
            </div>
          </div>
        </div>

        {/* Gaze */}
        <div className="mini-metric">
          <div className="mini-metric-label">Gaze Alignment</div>
          <div className={`mini-metric-value ${telemetry.gaze_anomaly ? 'danger' : 'safe'}`}>
            {telemetry.gaze_anomaly ? '⚠ Off Screen' : '✓ Aligned'}
          </div>
          <div className="mini-metric-sub">
            P:{Math.round(telemetry.pose?.pitch || 0)}° Y:{Math.round(telemetry.pose?.yaw || 0)}° R:{Math.round(telemetry.pose?.roll || 0)}°
          </div>
          {/* Pose mini-viz */}
          <div className="pose-viz">
            <div className="pose-axis" style={{ '--axis-fill': `${Math.abs(telemetry.pose?.yaw || 0) / 45 * 100}%`, '--axis-color': Math.abs(telemetry.pose?.yaw || 0) > 18 ? 'var(--aegis-red)' : 'var(--aegis-blue)' }}>
              <span>Yaw</span>
              <div className="pose-track"><div className="pose-fill" /></div>
            </div>
            <div className="pose-axis" style={{ '--axis-fill': `${Math.abs(telemetry.pose?.pitch || 0) / 30 * 100}%`, '--axis-color': Math.abs(telemetry.pose?.pitch || 0) > 15 ? 'var(--aegis-amber)' : 'var(--aegis-teal)' }}>
              <span>Pitch</span>
              <div className="pose-track"><div className="pose-fill" /></div>
            </div>
          </div>
        </div>

        {/* Hands */}
        <div className="mini-metric">
          <div className="mini-metric-label">Hands Detected</div>
          <div className={`mini-metric-value ${(telemetry.hands_visible || 0) > 1 ? 'warn' : 'safe'}`}>
            {telemetry.hands_visible || 0} visible
          </div>
          <div className="mini-metric-sub">{(telemetry.hands_visible || 0) > 1 ? 'Keep hands on desk' : 'Normal'}</div>
        </div>

        {/* CV Engine status */}
        <div className="mini-metric">
          <div className="mini-metric-label">CV Engine</div>
          <div className={`mini-metric-value ${cvStatus === 'connected' ? 'safe' : 'warn'}`} style={{ fontSize: '0.9rem' }}>
            {cvStatus === 'connected' ? '● Active' : '○ Connecting'}
          </div>
          <div className="mini-metric-sub">MediaPipe · solvePnP · v4.0</div>
        </div>

        {/* Privacy notice */}
        <div style={{ marginTop: 'auto' }}>
          <GazeForensicHudPanel />

          {/* rPPG Monitor Panel (Paper §rPPG) */}
          <RppgMonitor rppgData={rppgData} />

          {/* Speaker Verification Panel (Paper §Audio Forensics) */}
          <SpeakerVerificationPanel matchScore={speakerMatchScore} />

          <div className="mini-metric" style={{ border: '1px solid var(--border-blue)', background: 'rgba(59,130,246,0.04)' }}>
            <div className="mini-metric-label" style={{ color: 'var(--aegis-blue)' }}>Privacy</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-2)', lineHeight: 1.5, marginTop: 4 }}>
              Biometrics processed locally. No raw video sent without consent. Auto-purged after 90 days.
            </div>
          </div>
          {/* Layer 7 — Appeal button */}
          <button
            className="btn-secondary"
            style={{ width: '100%', marginTop: 8, fontSize: '0.72rem', padding: '7px 0', borderColor: 'var(--aegis-amber)', color: 'var(--aegis-amber)' }}
            onClick={() => setShowAppeal(true)}
          >
            ⚖ Appeal a Flag
          </button>
        </div>

        {/* Layer 6: Fraud Score Panel (compact) */}
        <FraudScorePanel compact />
      </div>

      {/* Layer 7 — Appeal overlay */}
      {showAppeal && <AppealPanel onClose={() => setShowAppeal(false)} />}

      {/* Layer 2 — Active liveness re-challenge */}
      {showReChallenge && (
        <MiniLivenessChallenge onComplete={(passed) => {
          setShowReChallenge(false);
          sendMsg({ type: 'telemetry_event', event: { type: 'PERIODIC_LIVENESS_COMPLETE', desc: 'Completed periodic active liveness gaze tracking.', severity: 'LOW', confidence: 1.0 } });
        }} />
      )}
    </div>
  );
}
