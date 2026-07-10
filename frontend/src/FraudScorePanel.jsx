/**
 * FraudScorePanel.jsx — Layer 6 Visualization + Layer 7 HITL Entry Point
 * 
 * Paper §8 Layer 6-7:
 *   - Real-time fraud score display with breakdown
 *   - Deepfake flag indicator
 *   - Signal-by-signal contribution chart
 *   - One-click HITL escalation
 *   - Advisory labeling (never auto-reject)
 */
import React, { useMemo } from 'react';
import { useAegisStore } from './useAegisStore';
import { computeFraudScore, VERDICT_STYLES } from './FraudScoreEngine';

const SIGNAL_LABELS = {
  // Biometric
  GAZE_ANOMALY:              { icon: '👁',  label: 'Gaze Deviation' },
  GAZE_READING_PATTERN:      { icon: '👁‍🗨', label: 'Overlay-Reading Gaze' },
  GAZE_DEVIATION_ANGLE:      { icon: '🎯',  label: 'Gaze Angle (θ>25°)' },
  SMOOTH_PURSUIT_DETECTED:   { icon: '↔',   label: 'Smooth Pursuit (<80°/s)' },
  FIXATION_UNIFORMITY:       { icon: '⊙',   label: 'Uniform Fixations' },
  HAND_ANOMALY:              { icon: '✋',  label: 'Hand Anomaly' },
  FACE_CONSISTENCY_FAIL:     { icon: '🔁',  label: 'Face Mismatch' },
  // AI timing & language
  AI_LATENCY_SIGNATURE:      { icon: '⏱',  label: 'AI Timing Signature' },
  LLM_PHRASEOLOGY_DETECTED:  { icon: '🧠',  label: 'LLM Phraseology' },
  // Audio
  WHISPER_COACHING_DETECTED: { icon: '🎙',  label: 'Whisper/Earpiece' },
  TTS_VOICE_DETECTED:        { icon: '🔊',  label: 'AI TTS Voice' },
  ACOUSTIC_ENVIRONMENT_CHANGE: { icon: '🔉', label: 'Acoustic Change' },
  COMPRESSED_AUDIO_DETECTED: { icon: '🔇',  label: 'Compressed Audio' },
  SECONDARY_VOICE_DETECTED:  { icon: '🎤',  label: 'Secondary Voice' },
  VOICE_MISMATCH:            { icon: '🎵',  label: 'Voice Mismatch' },
  // VM / environment
  VIRTUAL_MACHINE_DETECTED:  { icon: '💻',  label: 'Virtual Machine' },
  VIRTUAL_MACHINE_SUSPECTED: { icon: '🖥',  label: 'VM Suspected' },
  DEEPFAKE_CHALLENGE_FAIL:   { icon: '🎭',  label: 'Deepfake Challenge' },
  RPPG_NO_HEARTBEAT:         { icon: '💓',  label: 'No Heartbeat (rPPG)' },
  // Browser/extension
  SECONDARY_PERSON:          { icon: '👤',  label: 'Secondary Person' },
  TAB_SWITCH:                { icon: '🔀',  label: 'Tab Switch' },
  PASTE_ANOMALY:             { icon: '📋',  label: 'Large Paste' },
  TYPING_ANOMALY:            { icon: '⌨',   label: 'Typing Anomaly' },
  VIRTUAL_CAM:               { icon: '📷',  label: 'Virtual Camera' },
  DEVTOOLS_OPEN:             { icon: '🛠',  label: 'DevTools Open' },
  WINDOW_BLUR:               { icon: '🪟',  label: 'Window Blur' },
  ENV_SCAN_SKIPPED:          { icon: '🚫',  label: 'Room Scan Skip' },
  EXTENSION_DETECTED:        { icon: '🧩',  label: 'Extension Detected' },
  AI_API_CALL:               { icon: '🌐',  label: 'AI API Call' },
  COMPOUND_RISK:             { icon: '⛔',  label: 'Compound Risk' },
};

export default function FraudScorePanel({ compact = false }) {
  const { riskEvents, sessionSeconds, setHitlEvent } = useAegisStore();

  const { score, verdict, signals, breakdown, confidence, hasCompound } = useMemo(
    () => computeFraudScore(riskEvents, sessionSeconds),
    [riskEvents, sessionSeconds]
  );

  const style = VERDICT_STYLES[verdict];

  const escalateHITL = () => {
    setHitlEvent({
      type:    'MANUAL_ESCALATION',
      desc:    `Recruiter manually escalated: Fraud Score ${score}/100 (${verdict}). ${signals.length} signal(s) detected.`,
      severity: score >= 75 ? 'HIGH' : 'MEDIUM',
    });
  };

  if (compact) {
    return (
      <div className="fraud-pill" style={{ '--pill-color': style.color }}>
        <span>{style.icon}</span>
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '0.78rem', color: style.color }}>
          Fraud {score}
        </span>
        <span style={{ fontSize: '0.6rem', color: style.color, opacity: 0.8 }}>{style.label}</span>
      </div>
    );
  }

  return (
    <div className="fraud-panel" style={{ '--verdict-color': style.color, '--verdict-bg': style.bg }}>
      {/* Header */}
      <div className="fraud-panel-header">
        <div>
          <div className="fraud-panel-title">Fraud Score</div>
          <div className="fraud-panel-sub">Layer 6 · AI Fraud Detection</div>
        </div>
        <div className="fraud-score-badge" style={{ color: style.color, background: style.bg, border: `1px solid ${style.color}` }}>
          {score}/100
        </div>
      </div>

      {/* Verdict bar */}
      <div className="fraud-verdict-bar" style={{ background: style.bg, border: `1px solid ${style.color}30` }}>
        <span style={{ color: style.color, fontWeight: 700, fontSize: '0.78rem' }}>{style.icon} {style.label}</span>
        <span style={{ fontSize: '0.62rem', color: 'var(--text-3)' }}>ADVISORY — NOT AUTO-REJECT</span>
      </div>

      {/* Compound risk alert */}
      {hasCompound && (
        <div style={{
          margin: '8px 0', padding: '6px 12px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.4)',
          borderRadius: 8, fontSize: '0.68rem', fontWeight: 700, color: 'var(--aegis-red)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>⛔</span>
          <span>COMPOUND RISK ACTIVE — score amplified ×1.5</span>
        </div>
      )}

      {/* Confidence bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-3)' }}>Detection Confidence</span>
          <span style={{ fontSize: '0.6rem', fontFamily: 'var(--mono)', color: confidence > 0.6 ? 'var(--aegis-red)' : confidence > 0.3 ? 'var(--aegis-amber)' : 'var(--aegis-green)' }}>{(confidence * 100).toFixed(0)}%</span>
        </div>
        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99,
            width: `${confidence * 100}%`,
            background: confidence > 0.6 ? 'var(--aegis-red)' : confidence > 0.3 ? 'var(--aegis-amber)' : 'var(--aegis-green)',
            transition: 'width 0.8s ease',
          }} />
        </div>
        <div style={{ fontSize: '0.55rem', color: 'var(--text-4)', marginTop: 2 }}>
          {Object.keys(breakdown).filter(t => t !== 'COMPOUND_RISK').length} distinct signal type(s) across {signals.length} total event(s)
        </div>
      </div>

      {/* Score gauge */}
      <div className="fraud-gauge-track">
        <div className="fraud-gauge-fill"
          style={{
            width: `${score}%`,
            background: `linear-gradient(90deg, var(--aegis-green), ${score > 75 ? 'var(--aegis-red)' : score > 45 ? 'var(--aegis-amber)' : 'var(--aegis-cyan)'})`,
          }}
        />
        {/* Threshold markers */}
        <div className="fraud-marker" style={{ left: '20%' }} title="Low Risk" />
        <div className="fraud-marker" style={{ left: '45%' }} title="Moderate" />
        <div className="fraud-marker" style={{ left: '75%' }} title="High Risk" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.58rem', color: 'var(--text-4)', marginBottom: 12 }}>
        <span>Clean</span><span>Low</span><span>Moderate</span><span>High Risk</span>
      </div>

      {/* Signal breakdown */}
      {signals.length > 0 ? (
        <div className="fraud-signals">
          <div className="fraud-signals-title">Active Signals</div>
          {signals.sort((a, b) => b.score - a.score).map(sig => {
            const meta = SIGNAL_LABELS[sig.type] || { icon: '⚠', label: sig.type };
            const barW = Math.min((sig.score / 20) * 100, 100);
            return (
              <div key={sig.type} className="fraud-signal-row">
                <span className="fraud-sig-icon">{meta.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span className="fraud-sig-label">{meta.label}</span>
                    <span className="fraud-sig-count">{sig.count}× {sig.severity}</span>
                  </div>
                  <div className="fraud-sig-bar-track">
                    <div className="fraud-sig-bar-fill"
                      style={{
                        width: `${barW}%`,
                        background: sig.severity === 'HIGH' || sig.severity === 'CRITICAL'
                          ? 'var(--aegis-red)'
                          : sig.severity === 'MEDIUM'
                          ? 'var(--aegis-amber)'
                          : 'var(--aegis-blue)',
                      }}
                    />
                  </div>
                </div>
                <span className="fraud-sig-score" style={{ color: style.color }}>+{sig.score}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '12px 0', fontSize: '0.78rem', color: 'var(--aegis-green)' }}>
          ✓ No suspicious signals detected
        </div>
      )}

      {/* Disclaimer */}
      <div className="fraud-disclaimer">
        ⚖ All fraud signals are advisory. Final hiring decisions require human review. Candidates have the right to appeal any flag.
      </div>

      {/* HITL escalation */}
      {score > 0 && (
        <button className="fraud-escalate-btn" onClick={escalateHITL}>
          🚨 Escalate to Human Reviewer
        </button>
      )}
    </div>
  );
}
