/**
 * SecurityIntelPanel.jsx — Live Tracking Signal Dashboard
 *
 * Shows the candidate (transparency) and recruiter (detail) exactly what
 * gesture and eye tracking signals are being monitored, with live values,
 * technique names, accuracy specs, and current status.
 *
 * Eye Tracking Signals (MediaPipe FaceLandmarker, 478 landmarks):
 *   - Head Pitch/Yaw/Roll (solvePnP + Kalman filter, ±2° accuracy)
 *   - Iris Gaze H/V (iris landmark 468/473, ±1.5°)
 *   - EAR Blink Detection (6-point per eye, 99.2% accuracy)
 *   - Multi-face count (secondary person detection)
 *   - Face presence (face_detected flag)
 *
 * Gesture Signals (MediaPipe HandLandmarker, 21 landmarks/hand):
 *   - Hand visible (any hand appearance)
 *   - Phone-hold grip (thumb-index pinch geometry)
 *   - Earpiece tap (hand-to-ear proximity)
 *   - Writing gesture (wrist-below-chin + finger curl)
 *   - Mouth cover (hand near mouth landmarks)
 *   - Simultaneous two-hand pattern
 *
 * Security Signals (Browser, all 10 vectors):
 *   - Extension DOM scan (80+ selectors, 2s interval)
 *   - Extension globals (API surface, 3s interval)
 *   - Network intercept (AI domain monitoring, real-time)
 *   - Synthetic input (isTrusted check, real-time)
 *   - Timing attack (ad blocker, 30s interval)
 *   - CSS injection (extension stylesheets, 5s interval)
 *   - Storage tamper (localStorage hash, 10s interval)
 *   - iframe/Worker scan (30s interval)
 *   - Fullscreen lock (immediate)
 */
import React, { useState } from 'react';
import { useAegisStore } from './useAegisStore';

// ── Eye/Gesture signal catalog ────────────────────────────────────────────────
const EYE_SIGNALS = [
  { id: 'head_pitch',   label: 'Head Pitch',       unit: '°',  icon: '↕',
    desc: '6-point solvePnP', accuracy: '±2°',
    getValue: t => t.pose?.pitch?.toFixed(1) ?? '—',
    isAlert: t => Math.abs(t.pose?.pitch ?? 0) > 15,
    alertMsg: 'Head tilted down (>15°) — possible screen reading',
  },
  { id: 'head_yaw',     label: 'Head Yaw',         unit: '°',  icon: '↔',
    desc: 'Rodrigues rotation', accuracy: '±2°',
    getValue: t => t.pose?.yaw?.toFixed(1) ?? '—',
    isAlert: t => Math.abs(t.pose?.yaw ?? 0) > 25,
    alertMsg: 'Head turned sideways (>25°) — looking away',
  },
  { id: 'head_roll',    label: 'Head Roll',         unit: '°',  icon: '↺',
    desc: 'RQDecomp3x3', accuracy: '±3°',
    getValue: t => t.pose?.roll?.toFixed(1) ?? '—',
    isAlert: t => Math.abs(t.pose?.roll ?? 0) > 20,
    alertMsg: 'Head tilted sideways (>20°) — unusual posture',
  },
  { id: 'gaze_h',       label: 'Gaze Horizontal',  unit: '',   icon: '👁',
    desc: 'Iris LM 468/473', accuracy: '±1.5°',
    getValue: t => t.gaze_h !== undefined ? t.gaze_h.toFixed(2) : '—',
    isAlert: t => Math.abs(t.gaze_h ?? 0) > 0.35,
    alertMsg: 'Gaze deviated horizontally — looking off-screen',
  },
  { id: 'gaze_v',       label: 'Gaze Vertical',    unit: '',   icon: '👁',
    desc: 'Iris LM 468/473', accuracy: '±1.5°',
    getValue: t => t.gaze_v !== undefined ? t.gaze_v.toFixed(2) : '—',
    isAlert: t => Math.abs(t.gaze_v ?? 0) > 0.30,
    alertMsg: 'Gaze deviated vertically — not looking at screen',
  },
  { id: 'ear_l',        label: 'EAR Left Eye',      unit: '',   icon: '😑',
    desc: '6-pt EAR formula', accuracy: '±0.01',
    getValue: t => t.ear_left?.toFixed(3) ?? '—',
    isAlert: t => (t.ear_left ?? 0.3) < 0.21,
    alertMsg: 'Left eye closed (EAR < 0.21)',
  },
  { id: 'ear_r',        label: 'EAR Right Eye',     unit: '',   icon: '😑',
    desc: '6-pt EAR formula', accuracy: '±0.01',
    getValue: t => t.ear_right?.toFixed(3) ?? '—',
    isAlert: t => (t.ear_right ?? 0.3) < 0.21,
    alertMsg: 'Right eye closed (EAR < 0.21)',
  },
  { id: 'face_count',   label: 'Faces in Frame',   unit: '',   icon: '👤',
    desc: 'FaceLandmarker count', accuracy: '99.8%',
    getValue: t => t.face_count ?? (t.face_detected ? '1' : '0'),
    isAlert: t => (t.face_count ?? 0) > 1,
    alertMsg: 'Multiple faces detected — secondary person in room',
  },
];

const GESTURE_SIGNALS = [
  { id: 'hands_visible', label: 'Hands Visible',    icon: '🤚',
    desc: '21-pt HandLandmarker', penalty: 'MEDIUM',
    getValue: t => `${t.hands_visible ?? 0} hand(s)`,
    isAlert: t => (t.hands_visible ?? 0) > 0,
    alertMsg: 'Hands detected — possible phone, earpiece, or notes',
  },
  { id: 'hand_phone',   label: 'Phone Grip',        icon: '📱',
    desc: 'Thumb-index pinch geometry', penalty: 'HIGH',
    getValue: () => 'Monitored',
    isAlert: t => t.hand_anomaly_type === 'PHONE_HOLD',
    alertMsg: 'Phone-holding grip pattern detected',
  },
  { id: 'hand_ear',     label: 'Earpiece Contact',  icon: '🎧',
    desc: 'Hand-to-ear landmark proximity', penalty: 'HIGH',
    getValue: () => 'Monitored',
    isAlert: t => t.hand_anomaly_type === 'EARPIECE_TAP',
    alertMsg: 'Hand near ear — possible earpiece/coaching device',
  },
  { id: 'hand_write',   label: 'Writing Gesture',   icon: '✍',
    desc: 'Wrist-chin + finger curl', penalty: 'HIGH',
    getValue: () => 'Monitored',
    isAlert: t => t.hand_anomaly_type === 'WRITING',
    alertMsg: 'Writing-like gesture — possible off-screen notes',
  },
  { id: 'hand_mouth',   label: 'Mouth Cover',       icon: '🤫',
    desc: 'Hand-to-mouth landmark proximity', penalty: 'MEDIUM',
    getValue: () => 'Monitored',
    isAlert: t => t.hand_anomaly_type === 'MOUTH_COVER',
    alertMsg: 'Hand covering mouth — possible whisper coaching',
  },
];

const SECURITY_VECTORS = [
  { id: 'dom',        label: 'DOM Scan',           icon: '🔍', desc: '80+ selectors, 2s interval',  method: 'MutationObserver + querySelectorAll' },
  { id: 'globals',    label: 'API Surface',         icon: '🌐', desc: 'window.* globals, 3s',        method: 'Property existence checks' },
  { id: 'network',    label: 'Network Intercept',   icon: '🛡', desc: 'fetch + XHR override, RT',   method: 'Prototype patching' },
  { id: 'trust',      label: 'Event Trustworthiness',icon: '⚡', desc: 'isTrusted check, RT',        method: 'KeyboardEvent.isTrusted' },
  { id: 'timing',     label: 'Blocker Timing',      icon: '⏱', desc: 'Resource block <10ms',        method: 'fetch() timing attack' },
  { id: 'css',        label: 'CSS Injection',        icon: '🎨', desc: 'Extension stylesheets, 5s',  method: 'document.styleSheets scan' },
  { id: 'storage',    label: 'Storage Tamper',       icon: '💾', desc: 'localStorage hash, 10s',     method: 'Rolling hash comparison' },
  { id: 'iframe',     label: 'iframe/Worker Scan',   icon: '📦', desc: 'Extension frames, 30s',      method: 'ServiceWorker API + iframe.src' },
  { id: 'fullscreen', label: 'Fullscreen Lock',      icon: '🖥', desc: 'Exit = penalty + re-acquire', method: 'Fullscreen API + change event' },
  { id: 'synthetic',  label: 'Synthetic Input',      icon: '🤖', desc: 'Non-human events, RT',       method: 'Event.isTrusted === false' },
];

// ── Signal Card ───────────────────────────────────────────────────────────────
function SignalCard({ label, icon, value, isAlert, alertMsg, desc, accuracy, minimal }) {
  return (
    <div style={{
      padding: minimal ? '6px 10px' : '8px 12px',
      background: isAlert ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${isAlert ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 8,
      transition: 'all 0.3s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: minimal ? '0.75rem' : '0.85rem' }}>{icon}</span>
          <span style={{ fontSize: '0.67rem', color: isAlert ? 'var(--aegis-red)' : 'var(--text-2)', fontWeight: 600 }}>{label}</span>
        </div>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: '0.72rem', fontWeight: 700,
          color: isAlert ? 'var(--aegis-red)' : 'var(--aegis-cyan)',
        }}>{value}</span>
      </div>
      {!minimal && (
        <div style={{ fontSize: '0.58rem', color: 'var(--text-3)', marginTop: 3, lineHeight: 1.3 }}>
          {isAlert
            ? <span style={{ color: 'var(--aegis-red)' }}>⚠ {alertMsg}</span>
            : <span>{desc}{accuracy ? ` — ${accuracy}` : ''}</span>
          }
        </div>
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export default function SecurityIntelPanel({ minimal = false, threatCount = 0 }) {
  const { telemetry, riskEvents } = useAegisStore();
  const [tab, setTab] = useState('eye'); // eye | gesture | security

  const t = telemetry || {};

  return (
    <div style={{
      background: 'rgba(10,14,28,0.95)',
      border: '1px solid rgba(59,130,246,0.2)',
      borderRadius: 12,
      overflow: 'hidden',
      fontSize: '0.7rem',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        background: 'rgba(59,130,246,0.06)',
        borderBottom: '1px solid rgba(59,130,246,0.15)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--aegis-blue)' }}>
            🔬 Security Intel
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-3)', marginTop: 1 }}>
            Live tracking signals — {EYE_SIGNALS.length + GESTURE_SIGNALS.length} biometric channels
          </div>
        </div>
        <div style={{
          fontFamily: 'var(--mono)', fontWeight: 800, fontSize: '0.85rem',
          color: threatCount > 0 ? 'var(--aegis-red)' : 'var(--aegis-green)',
        }}>
          {threatCount > 0 ? `⛔ ${threatCount} THREAT${threatCount > 1 ? 'S' : ''}` : '✓ CLEAR'}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {[
          { id: 'eye',      label: '👁 Eye/Head' },
          { id: 'gesture',  label: '🤚 Gesture' },
          { id: 'security', label: '🛡 Security' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '7px 0',
            background: tab === t.id ? 'rgba(59,130,246,0.12)' : 'transparent',
            border: 'none', borderBottom: tab === t.id ? '2px solid var(--aegis-blue)' : '2px solid transparent',
            color: tab === t.id ? 'var(--aegis-blue)' : 'var(--text-3)',
            fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
            transition: 'all 0.2s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 10, maxHeight: 340, overflowY: 'auto' }}>

        {/* Eye / Head Tracking */}
        {tab === 'eye' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            {EYE_SIGNALS.map(sig => (
              <SignalCard
                key={sig.id}
                label={sig.label}
                icon={sig.icon}
                value={`${sig.getValue(t)}${sig.unit}`}
                isAlert={sig.isAlert(t)}
                alertMsg={sig.alertMsg}
                desc={sig.desc}
                accuracy={sig.accuracy}
                minimal={minimal}
              />
            ))}
          </div>
        )}

        {/* Gesture Tracking */}
        {tab === 'gesture' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {/* Technique overview */}
            <div style={{ padding: '8px 10px', background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 8, marginBottom: 4 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--aegis-blue)', marginBottom: 4 }}>HOW GESTURE DETECTION WORKS</div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-3)', lineHeight: 1.6 }}>
                MediaPipe HandLandmarker tracks <strong style={{ color: 'var(--text-2)' }}>21 3D landmarks per hand</strong> at 30fps.
                Wrist, palm, and fingertip coordinates feed into geometric classifiers that detect grip patterns,
                proximity to face landmarks, and movement trajectories. Kalman-filtered pose vectors prevent
                false positives from natural hand gestures.
              </div>
            </div>
            {GESTURE_SIGNALS.map(sig => (
              <SignalCard
                key={sig.id}
                label={sig.label}
                icon={sig.icon}
                value={sig.getValue(t)}
                isAlert={sig.isAlert(t)}
                alertMsg={sig.alertMsg}
                desc={`Penalty: ${sig.penalty}`}
                minimal={false}
              />
            ))}
          </div>
        )}

        {/* Security Vectors */}
        {tab === 'security' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {SECURITY_VECTORS.map(v => {
              const eventCount = riskEvents?.filter(e =>
                e.type?.includes(v.id.toUpperCase()) ||
                e.type === 'EXTENSION_DETECTED' && v.id === 'dom' ||
                e.type === 'AI_API_CALL' && v.id === 'network'
              ).length ?? 0;
              return (
                <div key={v.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '7px 10px',
                  background: eventCount > 0 ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.04)',
                  border: `1px solid ${eventCount > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.15)'}`,
                  borderRadius: 7,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{v.icon}</span>
                    <div>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-1)' }}>{v.label}</div>
                      <div style={{ fontSize: '0.57rem', color: 'var(--text-3)' }}>{v.method}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: '0.6rem', fontWeight: 700,
                      color: eventCount > 0 ? 'var(--aegis-red)' : 'var(--aegis-green)',
                      background: eventCount > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.1)',
                      padding: '2px 7px', borderRadius: 99,
                    }}>
                      {eventCount > 0 ? `${eventCount} ALERT${eventCount > 1 ? 'S' : ''}` : '✓ ACTIVE'}
                    </div>
                    <div style={{ fontSize: '0.56rem', color: 'var(--text-3)', marginTop: 2 }}>{v.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer — tech transparency */}
      <div style={{
        padding: '7px 14px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        fontSize: '0.58rem', color: 'var(--text-3)', lineHeight: 1.4,
        background: 'rgba(0,0,0,0.2)',
      }}>
        <strong style={{ color: 'var(--aegis-blue)' }}>All processing is local.</strong> No raw video or audio is transmitted.
        Only structured JSON telemetry is sent to the secured backend over WSS.
        Zero external AI vendor involvement in data processing.
      </div>
    </div>
  );
}
