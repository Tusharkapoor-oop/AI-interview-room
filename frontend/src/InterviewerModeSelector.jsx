/**
 * InterviewerModeSelector.jsx — Aegis v4.2
 *
 * Full-page mode selector where admin chooses:
 *   1. AI Interviewer   — AI asks questions, full biometric auto-scoring
 *   2. Human Interviewer — Real person interviews with admin access + live metrics
 *   3. Admin Only       — Full access to all controls, no interview flow
 */
import React, { useState, useEffect, useRef } from 'react';
import { useAegisStore } from './useAegisStore';

const MODES = [
  {
    id: 'ai',
    icon: '🤖',
    title: 'AI Interviewer',
    subtitle: 'Fully automated intelligent interview',
    color: 'var(--aegis-cyan)',
    gradient: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.02))',
    border: 'rgba(59,130,246,0.35)',
    features: [
      { icon: '🎤', text: 'AI voice asks adaptive questions in real-time' },
      { icon: '👁', text: 'Eye & gaze tracking — 478 facial landmarks, ±1.5° accuracy' },
      { icon: '🤚', text: 'Hand gesture recognition — 21 keypoints, phone/earpiece/writing detection' },
      { icon: '🧠', text: 'Confidence scoring from voice tone, cadence & hesitation' },
      { icon: '📊', text: 'Body language & posture scoring via head pitch/yaw/roll' },
      { icon: '🔢', text: 'Automatic marks: Technical + Behavioral + Biometric combined score' },
      { icon: '🛡', text: '10-vector security — all extensions, apps blocked, penalties auto-applied' },
      { icon: '📋', text: 'Full report generated automatically at interview end' },
    ],
    badge: 'FULLY AUTONOMOUS',
    badgeColor: 'var(--aegis-cyan)',
    requiredRole: 'candidate',
  },
  {
    id: 'human',
    icon: '👤',
    title: 'Human Interviewer',
    subtitle: 'Live person interviews with full real-time monitoring',
    color: 'var(--aegis-violet)',
    gradient: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(124,58,237,0.02))',
    border: 'rgba(124,58,237,0.35)',
    features: [
      { icon: '🎙', text: 'Interviewer speaks live — full duplex audio with candidate' },
      { icon: '📡', text: 'Live biometric feed: gaze, gesture, confidence, heart-rate (rPPG)' },
      { icon: '⭐', text: 'Per-question manual scoring with rubric templates' },
      { icon: '📝', text: 'Annotation tools: flag moments, add timestamped notes' },
      { icon: '🧩', text: 'Access question bank — pick, reorder, add custom questions' },
      { icon: '⏸', text: 'Pause / Resume interview at any point' },
      { icon: '🔴', text: 'Terminate session with reason + override final score' },
      { icon: '📊', text: 'Real-time fraud score + HITL alert dashboard' },
    ],
    badge: 'ADMIN ACCESS',
    badgeColor: 'var(--aegis-violet)',
    requiredRole: 'interviewer',
  },
  {
    id: 'admin',
    icon: '⚙',
    title: 'Admin Control',
    subtitle: 'Full system oversight — all sessions, all controls',
    color: 'var(--aegis-amber)',
    gradient: 'linear-gradient(135deg, rgba(245,158,11,0.10), rgba(245,158,11,0.02))',
    border: 'rgba(245,158,11,0.35)',
    features: [
      { icon: '👁', text: 'View ALL active interview sessions simultaneously' },
      { icon: '🔑', text: 'Override any score, flag, or session outcome' },
      { icon: '🛡', text: 'Manage extension whitelist, proctoring thresholds' },
      { icon: '📊', text: 'Live dashboard: biometric telemetry for all candidates' },
      { icon: '🚨', text: 'Receive and action HITL alerts from any session' },
      { icon: '🗄', text: 'Access forensic recordings, session replays, audit logs' },
      { icon: '⚠', text: 'Terminate any session instantly with cause documentation' },
      { icon: '📈', text: 'Cross-session analytics and fairness monitoring' },
    ],
    badge: 'ROOT ACCESS',
    badgeColor: 'var(--aegis-amber)',
    requiredRole: 'admin',
  },
];

// Animated particles background
function ParticlesBg({ color }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    const pts = Array.from({ length: 30 }, () => ({
      x: Math.random() * 800, y: Math.random() * 500,
      r: 0.5 + Math.random() * 1.5,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
    }));
    const draw = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `${color}55`;
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [color]);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', borderRadius: 'inherit' }} />;
}

// Mode card
function ModeCard({ mode, selected, onSelect, onLaunch }) {
  const [hovered, setHovered] = useState(false);
  const active = selected || hovered;

  return (
    <div
      onClick={() => onSelect(mode.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', overflow: 'hidden',
        border: `2px solid ${active ? mode.border : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 20,
        background: active ? mode.gradient : 'rgba(255,255,255,0.02)',
        padding: '28px 28px 24px',
        cursor: 'pointer',
        transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        transform: selected ? 'scale(1.02)' : hovered ? 'scale(1.01)' : 'scale(1)',
        boxShadow: selected ? `0 0 40px ${mode.color}20` : 'none',
        flex: 1, minWidth: 0,
      }}
    >
      {active && <ParticlesBg color={mode.color} />}

      {/* Badge */}
      <div style={{
        position: 'absolute', top: 16, right: 16,
        fontSize: '0.55rem', fontWeight: 900, letterSpacing: '2px',
        padding: '3px 10px', borderRadius: 99,
        color: mode.badgeColor,
        background: `${mode.badgeColor}15`,
        border: `1px solid ${mode.badgeColor}30`,
      }}>{mode.badge}</div>

      {/* Selected indicator */}
      {selected && (
        <div style={{
          position: 'absolute', top: 16, left: 16,
          width: 10, height: 10, borderRadius: '50%',
          background: mode.color,
          boxShadow: `0 0 12px ${mode.color}`,
          animation: 'pulse-ring 1.5s ease-out infinite',
        }} />
      )}

      {/* Icon */}
      <div style={{
        width: 64, height: 64, borderRadius: 18,
        background: `${mode.color}18`, border: `1px solid ${mode.color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '2rem', marginBottom: 18,
        position: 'relative', zIndex: 1,
        transition: 'transform 0.3s',
        transform: active ? 'scale(1.1)' : 'scale(1)',
      }}>{mode.icon}</div>

      {/* Title */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: '1.3rem', fontWeight: 900, color: active ? '#fff' : 'rgba(255,255,255,0.75)', letterSpacing: '-0.5px', marginBottom: 6, transition: 'color 0.2s' }}>
          {mode.title}
        </div>
        <div style={{ fontSize: '0.72rem', color: active ? `${mode.color}cc` : 'rgba(255,255,255,0.35)', marginBottom: 20, lineHeight: 1.5, transition: 'color 0.2s' }}>
          {mode.subtitle}
        </div>

        {/* Features */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {mode.features.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.85rem', flexShrink: 0, opacity: active ? 1 : 0.5, transition: 'opacity 0.2s' }}>{f.icon}</span>
              <span style={{ fontSize: '0.68rem', color: active ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)', lineHeight: 1.55, transition: 'color 0.2s' }}>{f.text}</span>
            </div>
          ))}
        </div>

        {/* Launch button (only when selected) */}
        {selected && (
          <button
            onClick={(e) => { e.stopPropagation(); onLaunch(mode.id); }}
            style={{
              width: '100%', padding: '12px 0',
              background: `linear-gradient(135deg, ${mode.color}, ${mode.color}cc)`,
              border: 'none', borderRadius: 12,
              color: '#fff', fontWeight: 800, fontSize: '0.82rem',
              cursor: 'pointer', fontFamily: 'inherit',
              letterSpacing: '0.5px',
              boxShadow: `0 4px 20px ${mode.color}40`,
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            Launch {mode.title} →
          </button>
        )}
      </div>
    </div>
  );
}

// Interviewer login modal
function InterviewerLoginModal({ mode, onConfirm, onCancel }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const CODES = { human: 'INTERVIEWER', admin: 'ADMIN123' };

  const handleSubmit = () => {
    if (code.toUpperCase() === CODES[mode]) {
      onConfirm();
    } else {
      setError('Invalid access code. Please try again.');
      setCode('');
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #0a0e1c, #0f1728)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20, padding: '40px 48px', maxWidth: 400, width: '90%',
        textAlign: 'center',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>{mode === 'admin' ? '⚙' : '👤'}</div>
        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', marginBottom: 8 }}>
          {mode === 'admin' ? 'Admin Authentication' : 'Interviewer Access'}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginBottom: 28, lineHeight: 1.6 }}>
          Enter your access code to unlock {mode === 'admin' ? 'Admin Control Panel' : 'Human Interviewer Mode'}.
          <br /><span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.62rem' }}>Demo code: {mode === 'admin' ? 'ADMIN123' : 'INTERVIEWER'}</span>
        </div>
        <input
          type="password"
          placeholder="Access Code"
          value={code}
          onChange={e => { setCode(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '12px 16px', borderRadius: 10,
            background: 'rgba(255,255,255,0.05)', border: error ? '1px solid var(--aegis-red)' : '1px solid rgba(255,255,255,0.12)',
            color: '#fff', fontSize: '1rem', fontFamily: 'monospace',
            letterSpacing: '4px', textAlign: 'center',
            marginBottom: error ? 8 : 20, outline: 'none',
          }}
        />
        {error && <div style={{ color: 'var(--aegis-red)', fontSize: '0.68rem', marginBottom: 16 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '11px 0', borderRadius: 10,
            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem',
          }}>Cancel</button>
          <button onClick={handleSubmit} style={{
            flex: 2, padding: '11px 0', borderRadius: 10,
            background: mode === 'admin' ? 'linear-gradient(135deg,var(--aegis-amber),#f4a430)' : 'linear-gradient(135deg,var(--aegis-violet),#9f5dff)',
            border: 'none', color: '#fff', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700,
          }}>Authenticate</button>
        </div>
      </div>
    </div>
  );
}

export default function InterviewerModeSelector() {
  const { setPhase, setInterviewMode, sessionConfig } = useAegisStore();
  const [selected, setSelected] = useState(null);
  const [showLogin, setShowLogin] = useState(null); // 'human' | 'admin'
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const handleLaunch = (modeId) => {
    if (modeId === 'ai') {
      setInterviewMode('ai');
      setPhase('liveness'); // continue normal candidate flow
    } else {
      setShowLogin(modeId);
    }
  };

  const handleLoginConfirm = () => {
    const mode = showLogin;
    setShowLogin(null);
    setInterviewMode(mode);
    if (mode === 'admin') {
      setPhase('recruiter');
    } else {
      setPhase('human_interviewer');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 20% 20%, rgba(59,130,246,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(124,58,237,0.08) 0%, transparent 50%), #04060f',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '40px 24px',
      fontFamily: '"Inter","Outfit",system-ui,sans-serif',
    }}>
      {showLogin && (
        <InterviewerLoginModal
          mode={showLogin}
          onConfirm={handleLoginConfirm}
          onCancel={() => setShowLogin(null)}
        />
      )}

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 52, maxWidth: 680 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: 'var(--aegis-green)',
            boxShadow: tick % 2 === 0 ? '0 0 10px var(--aegis-green)' : '0 0 3px var(--aegis-green)',
            transition: 'box-shadow 0.5s',
          }} />
          <span style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--aegis-green)' }}>AEGIS v4.2 · SESSION READY</span>
        </div>
        <h1 style={{
          margin: '0 0 12px',
          fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
          fontWeight: 900, letterSpacing: '-1.5px', color: '#fff', lineHeight: 1.1,
        }}>
          Select Interview<br />
          <span style={{ background: 'linear-gradient(135deg, var(--aegis-cyan), var(--aegis-violet))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Conductor Mode</span>
        </h1>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.7 }}>
          Choose whether an <strong style={{ color: 'rgba(255,255,255,0.65)' }}>AI</strong> or a <strong style={{ color: 'rgba(255,255,255,0.65)' }}>Human interviewer</strong> will conduct this session,
          or enter <strong style={{ color: 'rgba(255,255,255,0.65)' }}>Admin mode</strong> for full system oversight.
        </p>

        {/* Session pill */}
        {sessionConfig?.role && (
          <div style={{
            display: 'inline-flex', gap: 8, marginTop: 20, padding: '8px 16px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 99,
          }}>
            {[
              { label: 'Candidate', val: sessionConfig.candidateName || 'Candidate' },
              { label: 'Role', val: sessionConfig.role?.replace('_', ' ') },
              { label: 'Level', val: sessionConfig.seniority },
              { label: 'Type', val: sessionConfig.type?.replace('_', ' ') },
            ].map((s, i) => (
              <React.Fragment key={s.label}>
                <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)' }}>{s.label}:
                  <strong style={{ color: 'rgba(255,255,255,0.7)', marginLeft: 4, textTransform: 'capitalize' }}>{s.val}</strong>
                </span>
                {i < 3 && <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Mode cards */}
      <div style={{
        display: 'flex', gap: 20, width: '100%', maxWidth: 1300,
        flexWrap: 'wrap',
      }}>
        {MODES.map(mode => (
          <ModeCard
            key={mode.id}
            mode={mode}
            selected={selected === mode.id}
            onSelect={setSelected}
            onLaunch={handleLaunch}
          />
        ))}
      </div>

      {/* Footer note */}
      <div style={{
        marginTop: 40, fontSize: '0.65rem', color: 'rgba(255,255,255,0.2)',
        display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center',
      }}>
        {['🔒 End-to-end encrypted', '🇪🇺 GDPR compliant', '⚡ All biometrics local-only', '📋 Full audit log'].map(t => (
          <span key={t}>{t}</span>
        ))}
      </div>

      <style>{`
        @keyframes pulse-ring {
          0%   { box-shadow: 0 0 0 0 currentColor; }
          70%  { box-shadow: 0 0 0 8px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }
      `}</style>
    </div>
  );
}
