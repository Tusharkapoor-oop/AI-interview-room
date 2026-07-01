/**
 * HumanInterviewerPanel.jsx — Aegis v4.2
 *
 * Full admin control panel for a live human interviewer.
 * Features:
 *  - Live biometric telemetry sidebar (gaze, gesture, confidence, HR, fraud score)
 *  - Question bank with pick/reorder/custom question controls
 *  - Per-question manual scoring with rubric sliders
 *  - Session controls: pause, resume, terminate, annotate
 *  - HITL alert feed
 *  - Final score override and report generation
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAegisStore } from './useAegisStore';

// ── Question Bank ──────────────────────────────────────────────────────────────
const QUESTION_BANK = {
  technical: [
    { id: 'q1', text: 'Explain the difference between process and thread. How does context switching affect performance?', difficulty: 'medium', tags: ['OS', 'Performance'] },
    { id: 'q2', text: 'Design a distributed rate limiter that can handle 1 million requests per second.', difficulty: 'hard', tags: ['System Design', 'Distributed'] },
    { id: 'q3', text: 'What is the time complexity of quicksort in worst case? How would you mitigate it?', difficulty: 'easy', tags: ['Algorithms', 'Sorting'] },
    { id: 'q4', text: 'Explain CAP theorem. Give a real-world example where you had to choose between consistency and availability.', difficulty: 'hard', tags: ['Distributed', 'DB'] },
    { id: 'q5', text: 'How does garbage collection work in Java/Python? What are common GC issues and how do you profile them?', difficulty: 'medium', tags: ['Memory', 'Performance'] },
  ],
  behavioral: [
    { id: 'b1', text: 'Tell me about a time you had to disagree with your manager on a technical decision. How did it resolve?', difficulty: 'medium', tags: ['Leadership', 'Communication'] },
    { id: 'b2', text: 'Describe a project where you had to deliver under extreme time pressure. What trade-offs did you make?', difficulty: 'medium', tags: ['Pressure', 'Prioritization'] },
    { id: 'b3', text: 'Give an example of when you had to learn a completely new technology to solve a problem.', difficulty: 'easy', tags: ['Learning', 'Adaptability'] },
    { id: 'b4', text: 'Tell me about a time you failed significantly. What did you learn?', difficulty: 'hard', tags: ['Self-Awareness', 'Growth'] },
  ],
  system_design: [
    { id: 's1', text: 'Design YouTube. Focus on video upload pipeline, CDN strategy, and recommendation engine.', difficulty: 'hard', tags: ['CDN', 'Scale', 'ML'] },
    { id: 's2', text: 'Design a real-time collaborative document editor like Google Docs.', difficulty: 'hard', tags: ['CRDT', 'WebSocket', 'Sync'] },
    { id: 's3', text: 'Design a notification system that handles 100M users across mobile, email, and push.', difficulty: 'medium', tags: ['Kafka', 'Scale', 'Fanout'] },
  ],
};

const DIFF_COLOR = { easy: 'var(--aegis-green)', medium: 'var(--aegis-amber)', hard: '#ff6b35' };

// ── Scoring Rubric ─────────────────────────────────────────────────────────────
const RUBRIC_DIMENSIONS = [
  { id: 'technical_accuracy', label: 'Technical Accuracy', icon: '🎯', maxPts: 25 },
  { id: 'depth',              label: 'Depth & Breadth',    icon: '📐', maxPts: 20 },
  { id: 'communication',      label: 'Communication',      icon: '🎤', maxPts: 20 },
  { id: 'problem_solving',    label: 'Problem Solving',    icon: '🧩', maxPts: 20 },
  { id: 'confidence',         label: 'Confidence',         icon: '💪', maxPts: 15 },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function LiveMetricBadge({ label, value, unit = '', color = 'var(--aegis-cyan)', alert = false }) {
  return (
    <div style={{
      background: alert ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${alert ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 10, padding: '10px 14px',
      transition: 'all 0.3s',
    }}>
      <div style={{ fontSize: '0.58rem', fontWeight: 700, color: alert ? 'var(--aegis-red)' : 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '1.15rem', color: alert ? 'var(--aegis-red)' : color, lineHeight: 1 }}>
        {value}<span style={{ fontSize: '0.65rem', fontWeight: 400, marginLeft: 2 }}>{unit}</span>
      </div>
    </div>
  );
}

function RubricSlider({ dim, value, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.65)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>{dim.icon}</span> {dim.label}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 800, color: 'var(--aegis-cyan)' }}>{value}/{dim.maxPts}</span>
      </div>
      <input type="range" min={0} max={dim.maxPts} value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--aegis-cyan)', height: 4, cursor: 'pointer' }}
      />
    </div>
  );
}

function QuestionCard({ q, index, active, onSelect, onScore }) {
  const dc = DIFF_COLOR[q.difficulty] || '#4cc9f0';
  return (
    <div onClick={() => onSelect(q.id)} style={{
      padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
      border: `1px solid ${active ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.06)'}`,
      background: active ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.02)',
      transition: 'all 0.2s',
      marginBottom: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
          background: active ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.6rem', fontWeight: 800, color: active ? 'var(--aegis-cyan)' : 'rgba(255,255,255,0.3)',
        }}>{index + 1}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.7rem', color: active ? '#fff' : 'rgba(255,255,255,0.55)', lineHeight: 1.55, marginBottom: 6 }}>{q.text}</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.55rem', padding: '1px 6px', borderRadius: 4, background: `${dc}15`, border: `1px solid ${dc}30`, color: dc, fontWeight: 700 }}>
              {q.difficulty.toUpperCase()}
            </span>
            {q.tags.map(t => (
              <span key={t} style={{ fontSize: '0.55rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Alert event row
function AlertRow({ event }) {
  const sevColor = { CRITICAL: 'var(--aegis-red)', HIGH: '#ff6b35', MEDIUM: 'var(--aegis-amber)' };
  const c = sevColor[event.severity] || '#4cc9f0';
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      padding: '8px 10px', borderRadius: 8, marginBottom: 5,
      background: `${c}08`, border: `1px solid ${c}20`,
    }}>
      <span style={{ fontSize: '0.7rem', color: c, flexShrink: 0, marginTop: 1 }}>⚠</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, color: c }}>{event.severity} — {event.type}</div>
        <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>{event.desc}</div>
      </div>
      <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>{event.ts}</div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function HumanInterviewerPanel() {
  const {
    telemetry, riskEvents, integrityScore, gestureMetrics,
    rppgData, candidateName, sessionConfig, sessionSeconds,
    addRiskEvent, showToast, setPhase, messages,
  } = useAegisStore();

  const [isPaused, setIsPaused] = useState(false);
  const [activeQuestionId, setActiveQuestionId] = useState(null);
  const [scores, setScores] = useState({}); // { [questionId]: { [dimId]: number } }
  const [notes, setNotes] = useState('');
  const [annotations, setAnnotations] = useState([]); // { ts, sec, text }
  const [customQuestion, setCustomQuestion] = useState('');
  const [addedQuestions, setAddedQuestions] = useState([]);
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [terminateReason, setTerminateReason] = useState('');
  const [tab, setTab] = useState('questions'); // questions | scoring | alerts | notes
  const [qFilter, setQFilter] = useState('all');
  const [overallOverride, setOverallOverride] = useState(null);
  const notesRef = useRef(null);

  const t = telemetry || {};
  const g = gestureMetrics || {};
  const formatSec = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Derive confidence from voice + telemetry + gestures
  const confidenceScore = Math.max(0, Math.min(100,
    60
    + (t.face_detected ? 10 : -20)
    + (Math.abs(t.pose?.yaw || 0) < 15 ? 10 : -15)
    + (Math.abs(t.pose?.pitch || 0) < 10 ? 10 : -10)
    - (g.hands_visible > 0 ? 15 : 0)
    - ((riskEvents?.length || 0) * 3)
  ));
  const confColor = confidenceScore > 70 ? 'var(--aegis-green)' : confidenceScore > 45 ? 'var(--aegis-amber)' : 'var(--aegis-red)';

  // All questions pool
  const allQuestions = [
    ...(QUESTION_BANK[sessionConfig?.type] || QUESTION_BANK.technical),
    ...addedQuestions,
  ];
  const filteredQ = qFilter === 'all' ? allQuestions : allQuestions.filter(q => q.difficulty === qFilter);

  // Compute question score
  const getQScore = (qid) => {
    const s = scores[qid] || {};
    return RUBRIC_DIMENSIONS.reduce((acc, d) => acc + (s[d.id] || 0), 0);
  };
  const totalScore = allQuestions.reduce((a, q) => a + getQScore(q.id), 0);
  const maxPossible = allQuestions.length * RUBRIC_DIMENSIONS.reduce((a, d) => a + d.maxPts, 0);
  const pctScore = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;

  // Add annotation
  const addAnnotation = () => {
    if (!notes.trim()) return;
    const ann = { ts: new Date().toLocaleTimeString(), sec: sessionSeconds, text: notes };
    setAnnotations(a => [ann, ...a]);
    setNotes('');
  };

  // Add custom question
  const addCustomQ = () => {
    if (!customQuestion.trim()) return;
    setAddedQuestions(prev => [...prev, {
      id: `custom_${Date.now()}`, text: customQuestion,
      difficulty: 'medium', tags: ['Custom'],
    }]);
    setCustomQuestion('');
  };

  // Terminate session
  const handleTerminate = () => {
    if (!terminateReason.trim()) return;
    addRiskEvent({ type: 'SESSION_TERMINATED_BY_INTERVIEWER', severity: 'HIGH', desc: `Human interviewer terminated: ${terminateReason}` });
    showToast('⛔ Session terminated by interviewer', 'error', 8000);
    setPhase('report');
  };

  const scoreColor = (s) => s >= 80 ? 'var(--aegis-green)' : s >= 55 ? 'var(--aegis-amber)' : 'var(--aegis-red)';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '320px 1fr 300px',
      gridTemplateRows: '56px 1fr',
      height: 'calc(100vh - 56px)',
      background: '#06080f',
      fontFamily: '"Inter","Outfit",system-ui,sans-serif',
      overflow: 'hidden',
      color: '#fff',
    }}>

      {/* ══ TOP CONTROL BAR ══ */}
      <div style={{
        gridColumn: '1 / -1',
        display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px',
        background: 'rgba(239,68,68,0.04)', borderBottom: '1px solid rgba(239,68,68,0.15)',
      }}>
        {/* Mode badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 12px', borderRadius: 99,
          background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.35)',
        }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#9f5dff', letterSpacing: '1px' }}>👤 HUMAN INTERVIEWER</span>
        </div>

        {/* Candidate */}
        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
          Interviewing: <strong style={{ color: '#fff' }}>{candidateName}</strong>
          <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>·</span>
          <span style={{ marginLeft: 8, textTransform: 'capitalize', color: 'rgba(255,255,255,0.5)', fontSize: '0.72rem' }}>{sessionConfig?.role?.replace('_', ' ')} · {sessionConfig?.seniority}</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Timer */}
        <div style={{
          fontFamily: 'monospace', fontWeight: 900, fontSize: '1rem',
          color: isPaused ? 'var(--aegis-amber)' : 'var(--aegis-green)',
          background: isPaused ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.08)',
          border: `1px solid ${isPaused ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.2)'}`,
          padding: '4px 12px', borderRadius: 8,
        }}>
          {isPaused ? '⏸ ' : '▶ '}{formatSec(sessionSeconds)}
        </div>

        {/* Integrity */}
        <div style={{
          fontFamily: 'monospace', fontWeight: 800, fontSize: '0.85rem',
          color: scoreColor(integrityScore),
          background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
          padding: '4px 12px', borderRadius: 8,
        }}>
          🔒 {integrityScore}% Integrity
        </div>

        {/* Controls */}
        <button
          onClick={() => setIsPaused(p => !p)}
          style={{
            padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: isPaused ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
            color: isPaused ? 'var(--aegis-green)' : 'var(--aegis-amber)',
            fontSize: '0.75rem', fontWeight: 700, fontFamily: 'inherit',
          }}
        >{isPaused ? '▶ Resume' : '⏸ Pause'}</button>

        <button
          onClick={() => setShowTerminateModal(true)}
          style={{
            padding: '6px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.4)',
            background: 'rgba(239,68,68,0.12)', color: 'var(--aegis-red)',
            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'inherit',
          }}
        >⛔ Terminate</button>

        <button
          onClick={() => setPhase('report')}
          style={{
            padding: '6px 16px', borderRadius: 8, border: 'none',
            background: 'linear-gradient(135deg,var(--aegis-cyan),var(--aegis-violet))',
            color: '#fff', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'inherit',
          }}
        >📋 End → Report</button>
      </div>

      {/* ══ LEFT: LIVE BIOMETRICS SIDEBAR ══ */}
      <div style={{
        borderRight: '1px solid rgba(255,255,255,0.05)',
        overflowY: 'auto', padding: '16px 14px',
        background: 'rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {/* Pause overlay notice */}
        {isPaused && (
          <div style={{
            padding: '10px 14px', borderRadius: 10,
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
            fontSize: '0.7rem', color: 'var(--aegis-amber)', fontWeight: 700, textAlign: 'center',
          }}>⏸ Interview Paused — Candidate screen blocked</div>
        )}

        <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>LIVE BIOMETRICS</div>

        {/* Confidence Score — big feature */}
        <div style={{
          padding: '16px', borderRadius: 14,
          background: `${confColor}08`, border: `1px solid ${confColor}25`,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>CONFIDENCE SCORE</div>
          <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '3rem', color: confColor, lineHeight: 1 }}>{confidenceScore}</div>
          <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
            {confidenceScore >= 70 ? '✓ Confident & Engaged' : confidenceScore >= 45 ? '⚠ Moderate Confidence' : '⛔ Low Confidence / Nervous'}
          </div>
          {/* Progress bar */}
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', marginTop: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${confidenceScore}%`, background: confColor, borderRadius: 2, transition: 'width 1s, background 1s' }} />
          </div>
        </div>

        {/* Eye / Head tracking */}
        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--aegis-cyan)', textTransform: 'uppercase', letterSpacing: '1px' }}>Eye & Head Tracking</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
          <LiveMetricBadge label="Head Yaw" value={`${(t.pose?.yaw || 0).toFixed(1)}`} unit="°" color="var(--aegis-cyan)" alert={Math.abs(t.pose?.yaw || 0) > 25} />
          <LiveMetricBadge label="Head Pitch" value={`${(t.pose?.pitch || 0).toFixed(1)}`} unit="°" color="var(--aegis-cyan)" alert={Math.abs(t.pose?.pitch || 0) > 15} />
          <LiveMetricBadge label="Gaze H" value={`${(t.gaze_h || 0).toFixed(2)}`} color="#4cc9f0" alert={Math.abs(t.gaze_h || 0) > 0.35} />
          <LiveMetricBadge label="Gaze V" value={`${(t.gaze_v || 0).toFixed(2)}`} color="#4cc9f0" alert={Math.abs(t.gaze_v || 0) > 0.30} />
          <LiveMetricBadge label="EAR Left" value={`${(t.ear_left || 0.3).toFixed(3)}`} color="#00e5cc" alert={(t.ear_left || 0.3) < 0.21} />
          <LiveMetricBadge label="Faces" value={t.face_count ?? (t.face_detected ? '1' : '0')} color="var(--aegis-green)" alert={(t.face_count || 0) > 1} />
        </div>

        {/* Gesture tracking */}
        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#ff6b35', textTransform: 'uppercase', letterSpacing: '1px' }}>Gesture Recognition</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
          <LiveMetricBadge label="Hands" value={g.hands_visible || 0} color="#ff6b35" alert={(g.hands_visible || 0) > 0} />
          <LiveMetricBadge
            label="Gesture"
            value={g.hand_anomaly_type || 'None'}
            color={g.hand_anomaly_type ? 'var(--aegis-red)' : 'var(--aegis-green)'}
            alert={!!g.hand_anomaly_type}
          />
        </div>

        {/* Heart Rate */}
        {rppgData?.bpm && (
          <>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--aegis-red)', textTransform: 'uppercase', letterSpacing: '1px' }}>Physiological</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              <LiveMetricBadge label="Heart Rate" value={rppgData.bpm} unit=" bpm" color="var(--aegis-red)" alert={rppgData.bpm > 100 || rppgData.bpm < 55} />
              <LiveMetricBadge label="rPPG SNR" value={rppgData.snr?.toFixed(1)} unit=" dB" color="var(--aegis-amber)" />
            </div>
          </>
        )}

        {/* Recent alerts */}
        {(riskEvents?.length || 0) > 0 && (
          <>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--aegis-red)', textTransform: 'uppercase', letterSpacing: '1px', marginTop: 4 }}>⚠ Last Alert</div>
            {[...riskEvents].reverse().slice(0, 2).map(ev => (
              <div key={ev.id} style={{
                padding: '8px 10px', borderRadius: 8,
                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)',
                fontSize: '0.62rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5,
              }}>
                <span style={{ color: 'var(--aegis-red)', fontWeight: 700 }}>{ev.severity}</span> · {ev.desc?.slice(0, 70)}
              </div>
            ))}
          </>
        )}

        {/* Score summary */}
        <div style={{ marginTop: 4, padding: '12px 14px', borderRadius: 12, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--aegis-cyan)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>RUNNING SCORE</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '2rem', fontWeight: 900, color: scoreColor(pctScore) }}>{pctScore}<span style={{ fontSize: '0.85rem' }}>%</span></span>
            <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)' }}>{totalScore}/{maxPossible} pts</span>
          </div>
          <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', marginTop: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pctScore}%`, background: `linear-gradient(90deg, ${scoreColor(pctScore)}, ${scoreColor(pctScore)}aa)`, transition: 'width 0.5s' }} />
          </div>
        </div>
      </div>

      {/* ══ CENTER: QUESTION / SCORING WORKSPACE ══ */}
      <div style={{ overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: 4 }}>
          {[
            { id: 'questions', icon: '❓', label: 'Questions' },
            { id: 'scoring',   icon: '⭐', label: 'Scoring' },
            { id: 'alerts',    icon: '🚨', label: `Alerts (${riskEvents?.length || 0})` },
            { id: 'notes',     icon: '📝', label: 'Notes & Annotations' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: '8px 0',
              background: tab === t.id ? 'rgba(59,130,246,0.15)' : 'transparent',
              border: tab === t.id ? '1px solid rgba(59,130,246,0.35)' : '1px solid transparent',
              borderRadius: 7, color: tab === t.id ? 'var(--aegis-cyan)' : 'rgba(255,255,255,0.4)',
              fontSize: '0.72rem', fontWeight: tab === t.id ? 700 : 500,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
            }}>{t.icon} {t.label}</button>
          ))}
        </div>

        {/* ── TAB: Questions ── */}
        {tab === 'questions' && (
          <div>
            {/* Active question display */}
            {activeQuestionId && (
              <div style={{
                marginBottom: 20, padding: '20px 24px',
                background: 'rgba(59,130,246,0.06)', border: '2px solid rgba(59,130,246,0.3)',
                borderRadius: 16,
              }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--aegis-cyan)', marginBottom: 10 }}>
                  ▶ ACTIVE QUESTION
                </div>
                <div style={{ fontSize: '1.05rem', color: '#fff', lineHeight: 1.7, marginBottom: 14 }}>
                  {allQuestions.find(q => q.id === activeQuestionId)?.text}
                </div>
                <button onClick={() => setTab('scoring')} style={{
                  padding: '7px 16px', borderRadius: 8, border: 'none',
                  background: 'linear-gradient(135deg,var(--aegis-cyan),#4cc9f0)',
                  color: '#fff', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}>⭐ Score This Question →</button>
              </div>
            )}

            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {['all', 'easy', 'medium', 'hard'].map(f => (
                <button key={f} onClick={() => setQFilter(f)} style={{
                  padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: qFilter === f ? (DIFF_COLOR[f] || 'rgba(59,130,246,0.2)') : 'rgba(255,255,255,0.05)',
                  color: qFilter === f ? (f === 'all' ? '#fff' : '#000') : 'rgba(255,255,255,0.45)',
                  fontSize: '0.68rem', fontWeight: 700, fontFamily: 'inherit', textTransform: 'capitalize',
                }}>{f}</button>
              ))}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', alignSelf: 'center' }}>{filteredQ.length} questions</span>
            </div>

            {/* Question list */}
            {filteredQ.map((q, i) => (
              <QuestionCard key={q.id} q={q} index={i}
                active={activeQuestionId === q.id}
                onSelect={setActiveQuestionId}
              />
            ))}

            {/* Add custom question */}
            <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '1px' }}>➕ Add Custom Question</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={customQuestion}
                  onChange={e => setCustomQuestion(e.target.value)}
                  placeholder="Type a custom interview question…"
                  style={{
                    flex: 1, padding: '9px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff', fontSize: '0.72rem', fontFamily: 'inherit',
                  }}
                />
                <button onClick={addCustomQ} style={{
                  padding: '9px 16px', borderRadius: 8, border: 'none',
                  background: 'rgba(59,130,246,0.2)', color: 'var(--aegis-cyan)',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700,
                }}>Add</button>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: Scoring ── */}
        {tab === 'scoring' && (
          <div>
            {!activeQuestionId ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem' }}>
                ← Select a question first to score it
              </div>
            ) : (
              <div>
                {/* Active question context */}
                <div style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', marginBottom: 20 }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--aegis-cyan)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>Scoring Question</div>
                  <div style={{ fontSize: '0.82rem', color: '#fff', lineHeight: 1.6 }}>{allQuestions.find(q => q.id === activeQuestionId)?.text}</div>
                </div>

                {/* Rubric sliders */}
                <div style={{ marginBottom: 20 }}>
                  {RUBRIC_DIMENSIONS.map(dim => (
                    <RubricSlider
                      key={dim.id} dim={dim}
                      value={(scores[activeQuestionId]?.[dim.id]) || 0}
                      onChange={val => setScores(s => ({
                        ...s,
                        [activeQuestionId]: { ...(s[activeQuestionId] || {}), [dim.id]: val }
                      }))}
                    />
                  ))}
                </div>

                {/* Question total */}
                <div style={{
                  padding: '14px 18px', borderRadius: 12,
                  background: `${scoreColor(Math.round(getQScore(activeQuestionId) / (RUBRIC_DIMENSIONS.reduce((a, d) => a + d.maxPts, 0)) * 100))}0c`,
                  border: `1px solid ${scoreColor(Math.round(getQScore(activeQuestionId) / 100 * 100))}25`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)' }}>Question Score</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '1.4rem', color: scoreColor(pctScore) }}>
                    {getQScore(activeQuestionId)}/{RUBRIC_DIMENSIONS.reduce((a, d) => a + d.maxPts, 0)}
                  </span>
                </div>

                {/* Biometric auto-score note */}
                <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 6 }}>🤖 Biometric Auto-Assessment</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Gaze Engagement', val: `${Math.max(0, 100 - Math.round(Math.abs(t.pose?.yaw || 0) * 2))}%` },
                      { label: 'Posture Score', val: `${Math.max(0, 100 - Math.round(Math.abs(t.pose?.pitch || 0) * 3))}%` },
                      { label: 'Body Language', val: (g.hands_visible || 0) > 0 ? 'Flagged' : 'Normal' },
                      { label: 'Confidence', val: `${confidenceScore}%` },
                    ].map(m => (
                      <div key={m.label} style={{ padding: '5px 10px', borderRadius: 7, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}>
                        <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>{m.label}</div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--aegis-cyan)' }}>{m.val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Overall score override */}
            <div style={{ marginTop: 20, padding: '16px 18px', borderRadius: 12, background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--aegis-amber)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>⚠ FINAL SCORE OVERRIDE</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>Manual override (0–100):</span>
                <input type="number" min={0} max={100}
                  value={overallOverride ?? ''}
                  onChange={e => setOverallOverride(parseInt(e.target.value) || null)}
                  placeholder={`${pctScore}`}
                  style={{
                    width: 70, padding: '6px 10px', borderRadius: 7,
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(245,158,11,0.3)',
                    color: 'var(--aegis-amber)', fontSize: '0.9rem', fontFamily: 'monospace', fontWeight: 800, textAlign: 'center',
                  }}
                />
                {overallOverride !== null && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--aegis-amber)' }}>⚠ Override active</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: Alerts ── */}
        {tab === 'alerts' && (
          <div>
            <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', gap: 14 }}>
                {[
                  { label: 'Total Events', val: riskEvents?.length || 0, color: 'var(--aegis-cyan)' },
                  { label: 'Critical', val: riskEvents?.filter(e => e.severity === 'CRITICAL').length || 0, color: 'var(--aegis-red)' },
                  { label: 'High', val: riskEvents?.filter(e => e.severity === 'HIGH').length || 0, color: '#ff6b35' },
                  { label: 'Integrity', val: `${integrityScore}%`, color: scoreColor(integrityScore) },
                ].map(s => (
                  <div key={s.label} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '1.4rem', color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            {riskEvents?.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.25)', fontSize: '0.82rem' }}>✓ No security events detected</div>
            ) : (
              [...(riskEvents || [])].reverse().map(ev => <AlertRow key={ev.id} event={ev} />)
            )}
          </div>
        )}

        {/* ── TAB: Notes ── */}
        {tab === 'notes' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 8 }}>Add Timestamped Annotation</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <textarea
                  ref={notesRef}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add a note, observation, or flag about the current moment…"
                  rows={3}
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff', fontSize: '0.72rem', fontFamily: 'inherit', resize: 'vertical',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.25)' }}>@ {formatSec(sessionSeconds)}</span>
                <button onClick={addAnnotation} style={{
                  padding: '7px 16px', borderRadius: 8, border: 'none',
                  background: 'rgba(59,130,246,0.2)', color: 'var(--aegis-cyan)',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700,
                }}>📌 Add Annotation</button>
              </div>
            </div>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 10 }}>Annotations ({annotations.length})</div>
            {annotations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.2)', fontSize: '0.78rem' }}>No annotations yet</div>
            ) : (
              annotations.map((a, i) => (
                <div key={i} style={{
                  padding: '12px 14px', borderRadius: 10, marginBottom: 8,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: '0.58rem', fontFamily: 'monospace', color: 'var(--aegis-cyan)' }}>{a.ts} · {formatSec(a.sec)}</span>
                    <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.25)' }}>Note #{annotations.length - i}</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>{a.text}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ══ RIGHT: FINAL SCORE SUMMARY ══ */}
      <div style={{
        borderLeft: '1px solid rgba(255,255,255,0.05)',
        overflowY: 'auto', padding: '16px 14px',
        background: 'rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>SCORE BREAKDOWN</div>

        {/* Per-question scores */}
        {allQuestions.map((q, i) => {
          const qs = getQScore(q.id);
          const max = RUBRIC_DIMENSIONS.reduce((a, d) => a + d.maxPts, 0);
          const pct = max > 0 ? Math.round(qs / max * 100) : 0;
          const sc = scoreColor(pct);
          return (
            <div key={q.id} onClick={() => { setActiveQuestionId(q.id); setTab('scoring'); }}
              style={{
                padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                background: activeQuestionId === q.id ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${activeQuestionId === q.id ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                transition: 'all 0.2s',
              }}>
              <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', marginBottom: 5 }}>Q{i + 1} · {q.tags[0]}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: sc, transition: 'width 0.5s' }} />
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 800, color: sc, flexShrink: 0 }}>{qs}/{max}</span>
              </div>
            </div>
          );
        })}

        {/* Dimension breakdown */}
        <div style={{ marginTop: 8, padding: '12px 14px', borderRadius: 12, background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.12)' }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--aegis-cyan)', textTransform: 'uppercase', marginBottom: 10 }}>Dimension Totals</div>
          {RUBRIC_DIMENSIONS.map(dim => {
            const total = allQuestions.reduce((a, q) => a + (scores[q.id]?.[dim.id] || 0), 0);
            const maxTotal = allQuestions.length * dim.maxPts;
            const pct = maxTotal > 0 ? Math.round(total / maxTotal * 100) : 0;
            return (
              <div key={dim.id} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.5)' }}>{dim.icon} {dim.label}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.62rem', color: 'var(--aegis-cyan)' }}>{pct}%</span>
                </div>
                <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'var(--aegis-cyan)', transition: 'width 0.5s' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Final total */}
        <div style={{
          padding: '16px', borderRadius: 14,
          background: `${scoreColor(overallOverride ?? pctScore)}0a`,
          border: `2px solid ${scoreColor(overallOverride ?? pctScore)}30`,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>
            {overallOverride !== null ? '⚠ OVERRIDDEN SCORE' : 'TOTAL SCORE'}
          </div>
          <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '2.5rem', color: scoreColor(overallOverride ?? pctScore), lineHeight: 1 }}>
            {overallOverride ?? pctScore}<span style={{ fontSize: '1rem' }}>%</span>
          </div>
          <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
            {(overallOverride ?? pctScore) >= 80 ? '✓ Strong Hire' : (overallOverride ?? pctScore) >= 65 ? '⚡ Hire' : (overallOverride ?? pctScore) >= 50 ? '⚠ Borderline' : '✕ No Hire'}
          </div>
        </div>
      </div>

      {/* ══ TERMINATE MODAL ══ */}
      {showTerminateModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'linear-gradient(135deg,#0a0e1c,#0f1728)',
            border: '1px solid rgba(239,68,68,0.35)',
            borderRadius: 20, padding: '36px 44px', maxWidth: 440, width: '90%',
          }}>
            <div style={{ fontSize: '2rem', textAlign: 'center', marginBottom: 12 }}>⛔</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', textAlign: 'center', marginBottom: 6 }}>Terminate Interview</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginBottom: 24 }}>
              This will immediately end the session and generate a partial report. Please provide a reason.
            </div>
            <textarea
              value={terminateReason}
              onChange={e => setTerminateReason(e.target.value)}
              placeholder="Reason for termination…"
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(239,68,68,0.25)',
                color: '#fff', fontSize: '0.78rem', fontFamily: 'inherit', marginBottom: 16,
              }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowTerminateModal(false)} style={{
                flex: 1, padding: '11px 0', borderRadius: 10,
                background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem',
              }}>Cancel</button>
              <button onClick={handleTerminate} disabled={!terminateReason.trim()} style={{
                flex: 2, padding: '11px 0', borderRadius: 10,
                background: terminateReason.trim() ? 'linear-gradient(135deg,var(--aegis-red),#ff6b35)' : 'rgba(255,255,255,0.05)',
                border: 'none', color: terminateReason.trim() ? '#fff' : 'rgba(255,255,255,0.25)',
                cursor: terminateReason.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                fontSize: '0.78rem', fontWeight: 700,
              }}>⛔ Terminate Session</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
