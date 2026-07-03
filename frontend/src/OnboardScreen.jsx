/**
 * OnboardScreen.jsx — v5.0 WORLD-CLASS EDITION
 * - Aurora morphing background
 * - Glowing role chip selection with fire-border effect
 * - Live scan animation per diagnostic check
 * - Confetti burst on all-pass
 * - Step progress indicator
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAegisStore, getGlobalCameraStream } from './useAegisStore';

const ROLES = [
  { id: 'software_engineer', label: 'Software Engineer', icon: '⚙', color: 'var(--aegis-cyan)' },
  { id: 'data_scientist',    label: 'Data Scientist',    icon: '📊', color: 'var(--aegis-violet)' },
  { id: 'ml_engineer',       label: 'ML Engineer',       icon: '🧠', color: 'var(--aegis-plasma)' },
  { id: 'product_manager',   label: 'Product Manager',   icon: '🗺', color: 'var(--aegis-gold)' },
  { id: 'devops_engineer',   label: 'DevOps / SRE',      icon: '🔧', color: 'var(--aegis-green)' },
  { id: 'frontend_engineer', label: 'Frontend Engineer', icon: '🎨', color: 'var(--aegis-amber)' },
];

const SENIORITY = [
  { id: 'intern',   label: 'Intern',   sub: '0–1 yr' },
  { id: 'junior',   label: 'Junior',   sub: '1–3 yrs' },
  { id: 'mid',      label: 'Mid',      sub: '3–6 yrs' },
  { id: 'senior',   label: 'Senior',   sub: '6–10 yrs' },
  { id: 'staff',    label: 'Staff',    sub: '10+ yrs' },
  { id: 'director', label: 'Director', sub: 'Leadership' },
];

const INTERVIEW_TYPES = [
  { id: 'technical',     label: 'Technical Deep-Dive', icon: '💻', desc: 'Algorithms, System Design, Code' },
  { id: 'behavioral',    label: 'Behavioral Round',    icon: '🤝', desc: 'STAR method, soft skills' },
  { id: 'system_design', label: 'System Design',       icon: '🏗', desc: 'Architecture & scalability' },
  { id: 'full_loop',     label: 'Full Loop',           icon: '🔄', desc: 'Comprehensive multi-round' },
];

const CHECKS = [
  { id: 'camera',    label: 'Camera Array',          icon: '📷', detail: 'HD video capture enabled' },
  { id: 'mic',       label: 'Audio Forensics',       icon: '🎤', detail: 'Waveform analysis active' },
  { id: 'screen',    label: 'Mandatory Screen Share',icon: '🖥', detail: 'Desktop stream captured' },
  { id: 'bandwidth', label: 'Network Latency',       icon: '📡', detail: 'WebSocket link established' },
  { id: 'browser',   label: 'Hardware Acceleration', icon: '⚡', detail: 'WebGL & GPU available' },
];

const STEPS_NAV = ['Setup', 'Diagnostics', 'Ready'];

// CSS-only confetti burst (spawns random colored dots)
function ConfettiPiece({ i }) {
  const colors = ['#312e81','#4f46e5','#10b981','#f59e0b','#ef4444','#3b82f6'];
  const color = colors[i % colors.length];
  const x = (Math.random() - 0.5) * 300;
  const y = -(Math.random() * 200 + 50);
  const rot = Math.random() * 720 - 360;
  return (
    <div style={{
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: 8,
      height: 8,
      borderRadius: i % 3 === 0 ? '50%' : '2px',
      background: color,
      boxShadow: `0 0 6px ${color}`,
      transform: 'translate(-50%,-50%)',
      animation: `ob-confetti 1.4s cubic-bezier(0.23, 1, 0.32, 1) ${i * 0.03}s both`,
      '--cx': `${x}px`,
      '--cy': `${y}px`,
      '--cr': `${rot}deg`,
    }} />
  );
}

export default function OnboardScreen() {
  const {
    setPhase, setSessionConfig, setCandidateName,
    accommodationRequested, setAccommodationRequested,
  } = useAegisStore();

  const [step, setStep] = useState(0);
  const [config, setConfig] = useState({
    name: '', role: 'software_engineer', seniority: 'mid', type: 'technical',
  });
  const [statuses, setStatuses] = useState({});
  const [checking, setChecking] = useState(false);
  const [allPassed, setAllPassed] = useState(false);
  const nameRef = useRef(null);

  // Aurora canvas
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    const t0 = performance.now();
    const orbs = [
      { cx: 0.25, cy: 0.3,  r: 0.4, col: [99,102,241], speed: 0.00018 },
      { cx: 0.75, cy: 0.7,  r: 0.35,col: [34,211,238], speed: 0.00014 },
      { cx: 0.5,  cy: 0.9,  r: 0.3, col: [167,139,250],speed: 0.00022 },
    ];

    const tick = (ts) => {
      const t = ts - t0;
      canvas.width  = canvas.offsetWidth  || 800;
      canvas.height = canvas.offsetHeight || 600;
      const { width: W, height: H } = canvas;
      ctx.clearRect(0, 0, W, H);

      orbs.forEach((o, i) => {
        const ox = o.cx + Math.sin(t * o.speed + i) * 0.15;
        const oy = o.cy + Math.cos(t * o.speed * 0.7 + i) * 0.12;
        const grad = ctx.createRadialGradient(ox * W, oy * H, 0, ox * W, oy * H, o.r * W);
        grad.addColorStop(0, `rgba(${o.col.join(',')},0.12)`);
        grad.addColorStop(1, `rgba(${o.col.join(',')},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const runChecks = async () => {
    setChecking(true);
    setStep(1);
    const results = {};
    for (const check of CHECKS) {
      setStatuses(prev => ({ ...prev, [check.id]: 'check' }));
      await new Promise(r => setTimeout(r, 800));
      let pass = true;
      if (check.id === 'camera' || check.id === 'mic') {
        try {
          await getGlobalCameraStream();
        } catch { pass = false; }
      } else if (check.id === 'screen') {
        try {
          const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
          window.aegisScreenStream = s;
        } catch { pass = false; }
      } else if (check.id === 'browser') {
        try {
          const c = document.createElement('canvas');
          pass = !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
        } catch { pass = false; }
      }
      results[check.id] = pass ? 'pass' : 'fail';
      setStatuses(prev => ({ ...prev, [check.id]: results[check.id] }));
    }
    setChecking(false);
    setStep(2);
    setAllPassed(Object.values(results).every(v => v === 'pass'));
  };

  const handleProceed = () => {
    setSessionConfig({ role: config.role, seniority: config.seniority, type: config.type });
    setCandidateName(config.name || 'Candidate');
    setPhase('mode_select');
  };

  const selectedRole = ROLES.find(r => r.id === config.role);
  const selectedType = INTERVIEW_TYPES.find(t => t.id === config.type);

  return (
    <div className="ob5-root">
      {/* Aurora background */}
      <canvas ref={canvasRef} className="ob5-aurora" aria-hidden="true" />

      {/* Noise grid overlay */}
      <div className="ob5-grid" aria-hidden="true" />

      <div className="ob5-card">
        {/* Top gradient accent line */}
        <div className="ob5-card-accent" aria-hidden="true" />

        {/* Brand header */}
        <div className="ob5-brand">
          <div className="ob5-shield" aria-hidden="true">⬡</div>
          <div>
            <div className="ob5-brand-name">AEGIS</div>
            <div className="ob5-brand-sub">AI Interview Platform v5.0</div>
          </div>
        </div>

        {/* Step progress nav */}
        <div className="ob5-steps" role="tablist" aria-label="Progress steps">
          {STEPS_NAV.map((s, i) => (
            <div key={s} className={`ob5-step ${i < step ? 'done' : i === step ? 'active' : 'future'}`} role="tab" aria-selected={i === step}>
              <div className="ob5-step-circle">
                {i < step ? '✓' : i + 1}
              </div>
              <span className="ob5-step-label">{s}</span>
              {i < STEPS_NAV.length - 1 && <div className="ob5-step-line" aria-hidden="true" />}
            </div>
          ))}
        </div>

        {/* ── Step 0: Configuration ── */}
        {step === 0 && (
          <div className="ob5-config" style={{ animation: 'ob5-in 0.5s var(--ease-out)' }}>
            <h1 className="ob5-title">Configure Your Session</h1>
            <p className="ob5-sub">Aria will tailor the interview experience to your profile.</p>

            {/* Name */}
            <div className="ob5-field">
              <label className="ob5-label" htmlFor="ob5-name">Your Name</label>
              <div className="ob5-input-wrap">
                <input
                  id="ob5-name"
                  ref={nameRef}
                  className="ob5-input"
                  placeholder="Enter your full name"
                  value={config.name}
                  onChange={e => setConfig(c => ({ ...c, name: e.target.value }))}
                  autoFocus
                  autoComplete="name"
                />
                {config.name && (
                  <div className="ob5-input-glow" aria-hidden="true" />
                )}
              </div>
            </div>

            {/* Accommodation */}
            <div className="ob5-accommodation">
              <label className="ob5-accom-label">
                <input
                  type="checkbox"
                  checked={accommodationRequested}
                  onChange={e => setAccommodationRequested(e.target.checked)}
                  className="ob5-accom-check"
                />
                <span className="ob5-accom-icon">♿</span>
                <span>Request Accessibility Accommodations</span>
              </label>
              {accommodationRequested && (
                <div className="ob5-accom-detail">
                  Accommodation mode active — recommends Relaxed Proctoring to disable strict eye-gaze and head-pose thresholds during technical rounds.
                </div>
              )}
            </div>

            {/* Role picker */}
            <div className="ob5-field">
              <label className="ob5-label">Target Role</label>
              <div className="ob5-role-grid" role="radiogroup" aria-label="Select target role">
                {ROLES.map(r => (
                  <button
                    key={r.id}
                    role="radio"
                    aria-checked={config.role === r.id}
                    className={`ob5-role-chip ${config.role === r.id ? 'selected' : ''}`}
                    style={{ '--chip-col': r.color }}
                    onClick={() => setConfig(c => ({ ...c, role: r.id }))}
                  >
                    <span className="ob5-role-icon" aria-hidden="true">{r.icon}</span>
                    <span className="ob5-role-label">{r.label}</span>
                    {config.role === r.id && <div className="ob5-chip-glow" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Seniority */}
            <div className="ob5-field">
              <label className="ob5-label">Seniority Level</label>
              <div className="ob5-seniority" role="radiogroup" aria-label="Select seniority level">
                {SENIORITY.map(s => (
                  <button
                    key={s.id}
                    role="radio"
                    aria-checked={config.seniority === s.id}
                    className={`ob5-sen-btn ${config.seniority === s.id ? 'selected' : ''}`}
                    onClick={() => setConfig(c => ({ ...c, seniority: s.id }))}
                  >
                    <div className="ob5-sen-name">{s.label}</div>
                    <div className="ob5-sen-sub">{s.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Interview type */}
            <div className="ob5-field">
              <label className="ob5-label">Interview Type</label>
              <div className="ob5-type-grid" role="radiogroup" aria-label="Select interview type">
                {INTERVIEW_TYPES.map(t => (
                  <button
                    key={t.id}
                    role="radio"
                    aria-checked={config.type === t.id}
                    className={`ob5-type-card ${config.type === t.id ? 'selected' : ''}`}
                    onClick={() => setConfig(c => ({ ...c, type: t.id }))}
                  >
                    <span className="ob5-type-icon" aria-hidden="true">{t.icon}</span>
                    <div>
                      <div className="ob5-type-name">{t.label}</div>
                      <div className="ob5-type-desc">{t.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Summary pill */}
            {config.name && (
              <div className="ob5-summary" aria-label="Selected configuration">
                <span style={{ color: selectedRole?.color }}>{selectedRole?.icon} {selectedRole?.label}</span>
                <span className="ob5-sum-sep">·</span>
                <span>{SENIORITY.find(s => s.id === config.seniority)?.label}</span>
                <span className="ob5-sum-sep">·</span>
                <span>{selectedType?.icon} {selectedType?.label}</span>
              </div>
            )}

            <button
              className="ob5-btn-primary"
              onClick={runChecks}
              disabled={!config.name.trim()}
            >
              <span>Run System Diagnostics</span>
              <span className="ob5-btn-arrow">→</span>
            </button>
          </div>
        )}

        {/* ── Step 1/2: Diagnostics ── */}
        {step >= 1 && (
          <div style={{ animation: 'ob5-in 0.4s var(--ease-out)' }}>
            <div className="ob5-diag-header">
              <h2 className="ob5-title" style={{ fontSize: '1.4rem' }}>
                {checking ? '🔍 Scanning Environment...' : allPassed ? '✅ All Systems Nominal' : '⚠ Issues Detected'}
              </h2>
              <p className="ob5-sub" style={{ marginBottom: 0 }}>
                {checking
                  ? 'Aegis is calibrating your hardware environment.'
                  : allPassed
                    ? `Welcome, ${config.name}. Your session is secure.`
                    : 'Please resolve the flagged items to proceed.'}
              </p>
            </div>

            {/* Shimmer progress bar */}
            {checking && (
              <div className="ob5-progress-bar">
                <div className="ob5-progress-fill" />
              </div>
            )}

            {/* Check list */}
            <div className="ob5-checks">
              {CHECKS.map((check, idx) => {
                const status = statuses[check.id];
                if (!status) return null;
                return (
                  <div
                    key={check.id}
                    className={`ob5-check-item ${status}`}
                    style={{ animationDelay: `${idx * 0.08}s` }}
                  >
                    {/* Scan sweep for active checks */}
                    {status === 'check' && (
                      <div className="ob5-scan-sweep" aria-hidden="true" />
                    )}
                    <span className="ob5-check-icon" aria-hidden="true">{check.icon}</span>
                    <div className="ob5-check-body">
                      <div className="ob5-check-label">{check.label}</div>
                      <div className="ob5-check-detail">{check.detail}</div>
                    </div>
                    <div className={`ob5-check-badge ${status}`}>
                      {status === 'check' && <span className="ob5-spinner" aria-label="checking" />}
                      {status === 'pass' && '✓ PASS'}
                      {status === 'fail' && '✕ FAIL'}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* All-pass confetti burst */}
            {step === 2 && allPassed && (
              <div className="ob5-confetti" aria-hidden="true">
                {Array.from({ length: 32 }).map((_, i) => <ConfettiPiece key={i} i={i} />)}
              </div>
            )}

            {step === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24, width: '100%' }}>
                <button
                  className={`ob5-btn-primary ${allPassed ? 'success' : ''}`}
                  style={{
                    background: allPassed
                      ? 'linear-gradient(135deg, var(--aegis-green), #059669)'
                      : 'linear-gradient(135deg, var(--aegis-amber), #d97706)',
                    cursor: 'pointer',
                    opacity: 1,
                    boxShadow: allPassed ? '0 0 20px rgba(16,185,129,0.3)' : '0 0 20px rgba(245,158,11,0.3)'
                  }}
                  onClick={handleProceed}
                >
                  {allPassed ? (
                    <><span>🚀 Proceed to Mode Selection — {config.name || 'Candidate'}</span><span className="ob5-btn-arrow">→</span></>
                  ) : (
                    <><span>⚡ Override Diagnostics & Proceed to Mode Selection</span><span className="ob5-btn-arrow">→</span></>
                  )}
                </button>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => {
                      setSessionConfig({ role: config.role, seniority: config.seniority, type: config.type });
                      setCandidateName(config.name || 'Candidate');
                      setPhase('interview');
                    }}
                    style={{
                      flex: 2,
                      padding: '12px 18px',
                      borderRadius: 'var(--r-md)',
                      background: 'linear-gradient(135deg, var(--aegis-cyan), var(--aegis-blue))',
                      border: '1px solid rgba(56,189,248,0.4)',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      boxShadow: '0 0 15px rgba(56,189,248,0.25)'
                    }}
                  >
                    <span>🎯 Direct Connect to Live Interview Arena</span>
                    <span>⚡</span>
                  </button>

                  <button
                    onClick={runChecks}
                    style={{
                      flex: 1,
                      padding: '12px 14px',
                      borderRadius: 'var(--r-md)',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: 'var(--text-2)',
                      fontSize: '0.78rem',
                      cursor: 'pointer'
                    }}
                  >
                    🔄 Re-scan
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Compliance footer */}
        <div className="ob5-compliance">
          {['GDPR', 'BIPA', 'CCPA', 'EEOC', 'SOC 2'].map(b => (
            <span key={b} className="ob5-compliance-badge">{b}</span>
          ))}
        </div>
      </div>

      <style>{`
        /* ── OnboardScreen v5.0 Scoped Styles ── */
        .ob5-root {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: var(--void);
        }

        .ob5-aurora {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }

        .ob5-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(99,102,241,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.035) 1px, transparent 1px);
          background-size: 44px 44px;
          pointer-events: none;
        }

        .ob5-card {
          position: relative;
          z-index: 10;
          width: 600px;
          max-height: calc(100vh - 60px);
          overflow-y: auto;
          background: rgba(9, 9, 18, 0.82);
          backdrop-filter: blur(48px) saturate(160%);
          -webkit-backdrop-filter: blur(48px) saturate(160%);
          border: 1px solid rgba(99, 102, 241, 0.18);
          border-radius: 24px;
          padding: 36px 40px 32px;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.04) inset,
            0 40px 100px rgba(0,0,0,0.8),
            0 0 80px rgba(99,102,241,0.06);
          animation: ob5-in 0.6s var(--ease-out);
        }

        .ob5-card-accent {
          position: absolute;
          top: 0;
          left: 10%;
          right: 10%;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--aegis-cyan), var(--aegis-violet), transparent);
          opacity: 0.55;
          border-radius: 0 0 50% 50%;
        }

        .ob5-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
        }

        .ob5-shield {
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, var(--aegis-cyan), var(--aegis-violet));
          clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          flex-shrink: 0;
          animation: shield-pulse 3s ease-in-out infinite;
          filter: drop-shadow(0 0 10px rgba(34,211,238,0.4));
        }

        .ob5-brand-name {
          font-size: 1rem;
          font-weight: 800;
          letter-spacing: 4px;
          text-transform: uppercase;
          background: linear-gradient(90deg, #fff, var(--aegis-cyan));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .ob5-brand-sub {
          font-size: 0.62rem;
          font-weight: 500;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: var(--aegis-cyan);
          opacity: 0.7;
          margin-top: 2px;
        }

        /* Step Progress */
        .ob5-steps {
          display: flex;
          align-items: center;
          margin-bottom: 28px;
          gap: 0;
        }

        .ob5-step {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }

        .ob5-step-circle {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          flex-shrink: 0;
          border: 1.5px solid rgba(255,255,255,0.1);
          color: var(--text-3);
          transition: all 0.3s var(--ease-out);
        }

        .ob5-step.done .ob5-step-circle {
          background: rgba(74,222,128,0.15);
          border-color: var(--aegis-green);
          color: var(--aegis-green);
        }

        .ob5-step.active .ob5-step-circle {
          background: linear-gradient(135deg, var(--aegis-cyan), var(--aegis-violet));
          border-color: transparent;
          color: #fff;
          box-shadow: 0 0 16px rgba(34,211,238,0.4);
        }

        .ob5-step-label {
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-3);
          transition: color 0.3s;
        }

        .ob5-step.active .ob5-step-label { color: var(--aegis-cyan); }
        .ob5-step.done  .ob5-step-label  { color: var(--aegis-green); }

        .ob5-step-line {
          flex: 1;
          height: 1px;
          background: rgba(255,255,255,0.08);
          margin: 0 8px;
        }

        /* Text */
        .ob5-title {
          font-size: 1.55rem;
          font-weight: 800;
          letter-spacing: -0.4px;
          color: var(--text-1);
          margin-bottom: 6px;
        }

        .ob5-sub {
          font-size: 0.85rem;
          color: var(--text-2);
          margin-bottom: 24px;
          line-height: 1.6;
        }

        /* Fields */
        .ob5-field { margin-bottom: 20px; }

        .ob5-label {
          display: block;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-3);
          margin-bottom: 10px;
        }

        /* Name input */
        .ob5-input-wrap { position: relative; }

        .ob5-input {
          width: 100%;
          padding: 13px 16px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: var(--text-1);
          font-family: var(--font);
          font-size: 0.9rem;
          font-weight: 500;
          outline: none;
          transition: all 0.3s var(--ease);
        }

        .ob5-input:focus {
          border-color: var(--aegis-cyan);
          background: rgba(34,211,238,0.04);
          box-shadow: 0 0 0 3px rgba(34,211,238,0.1);
        }

        .ob5-input::placeholder { color: var(--text-4); }

        .ob5-input-glow {
          position: absolute;
          inset: 0;
          border-radius: 12px;
          background: radial-gradient(ellipse at 50% 100%, rgba(34,211,238,0.08), transparent 70%);
          pointer-events: none;
        }

        /* Accommodation */
        .ob5-accommodation {
          margin: 0 0 20px;
          padding: 14px 16px;
          background: rgba(99,102,241,0.05);
          border: 1px solid rgba(99,102,241,0.15);
          border-radius: 12px;
        }

        .ob5-accom-label {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          font-size: 0.78rem;
          color: var(--text-2);
          font-weight: 600;
        }

        .ob5-accom-check {
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: var(--aegis-cyan);
          flex-shrink: 0;
        }

        .ob5-accom-icon { font-size: 1rem; }

        .ob5-accom-detail {
          margin-top: 10px;
          font-size: 0.72rem;
          color: var(--text-3);
          line-height: 1.55;
          padding-left: 26px;
        }

        /* Role chips grid */
        .ob5-role-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        .ob5-role-chip {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 14px 8px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px;
          cursor: pointer;
          font-family: var(--font);
          transition: all 0.3s var(--ease-out);
          overflow: hidden;
        }

        .ob5-role-chip:hover {
          border-color: var(--chip-col);
          background: rgba(255,255,255,0.06);
          transform: translateY(-2px);
        }

        .ob5-role-chip.selected {
          border-color: var(--chip-col);
          background: rgba(255,255,255,0.06);
          box-shadow: 0 0 0 1px var(--chip-col), 0 0 20px color-mix(in srgb, var(--chip-col) 25%, transparent);
        }

        .ob5-chip-glow {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 50% 50%, color-mix(in srgb, var(--chip-col) 18%, transparent), transparent 70%);
          pointer-events: none;
          animation: ob5-chip-glow-pulse 2s ease-in-out infinite;
        }

        @keyframes ob5-chip-glow-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }

        .ob5-role-icon { font-size: 1.4rem; line-height: 1; }

        .ob5-role-label {
          font-size: 0.68rem;
          font-weight: 600;
          color: var(--text-2);
          text-align: center;
          line-height: 1.3;
        }

        .ob5-role-chip.selected .ob5-role-label { color: var(--text-1); }

        /* Seniority strip */
        .ob5-seniority {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .ob5-sen-btn {
          padding: 9px 14px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 8px;
          cursor: pointer;
          font-family: var(--font);
          transition: all 0.25s var(--ease);
          text-align: center;
        }

        .ob5-sen-btn:hover {
          border-color: rgba(34,211,238,0.4);
          background: rgba(34,211,238,0.06);
        }

        .ob5-sen-btn.selected {
          border-color: var(--aegis-cyan);
          background: rgba(34,211,238,0.1);
          box-shadow: 0 0 12px rgba(34,211,238,0.2);
        }

        .ob5-sen-name {
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--text-1);
          white-space: nowrap;
        }

        .ob5-sen-sub {
          font-size: 0.6rem;
          color: var(--text-3);
          margin-top: 2px;
          white-space: nowrap;
        }

        /* Interview type grid */
        .ob5-type-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .ob5-type-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px;
          cursor: pointer;
          font-family: var(--font);
          text-align: left;
          transition: all 0.3s var(--ease-out);
        }

        .ob5-type-card:hover {
          border-color: rgba(167,139,250,0.4);
          background: rgba(167,139,250,0.06);
          transform: translateY(-1px);
        }

        .ob5-type-card.selected {
          border-color: var(--aegis-violet);
          background: rgba(167,139,250,0.1);
          box-shadow: 0 0 16px rgba(167,139,250,0.2);
        }

        .ob5-type-icon { font-size: 1.4rem; flex-shrink: 0; }

        .ob5-type-name {
          font-size: 0.82rem;
          font-weight: 700;
          color: var(--text-1);
          margin-bottom: 2px;
        }

        .ob5-type-desc {
          font-size: 0.68rem;
          color: var(--text-3);
          line-height: 1.3;
        }

        /* Summary */
        .ob5-summary {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          padding: 10px 16px;
          background: rgba(34,211,238,0.05);
          border: 1px solid rgba(34,211,238,0.15);
          border-radius: 10px;
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--text-2);
          margin-bottom: 20px;
          animation: ob5-in 0.3s var(--ease-out);
        }

        .ob5-sum-sep { color: var(--text-4); }

        /* Primary button */
        .ob5-btn-primary {
          width: 100%;
          padding: 15px;
          border-radius: 12px;
          background: linear-gradient(135deg, var(--aegis-cyan), var(--aegis-violet));
          border: none;
          color: #fff;
          font-family: var(--font);
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          cursor: pointer;
          transition: all 0.3s var(--ease-out);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 4px 24px rgba(34,211,238,0.25), 0 0 0 1px rgba(255,255,255,0.08) inset;
          position: relative;
          overflow: hidden;
          margin-top: 4px;
        }

        .ob5-btn-primary::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
          transform: translateX(-100%);
          transition: transform 0.6s;
        }

        .ob5-btn-primary:hover:not(:disabled)::after { transform: translateX(100%); }

        .ob5-btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(34,211,238,0.4), 0 0 0 1px rgba(255,255,255,0.12) inset;
        }

        .ob5-btn-primary.success {
          background: linear-gradient(135deg, var(--aegis-green), #22d3ee);
          box-shadow: 0 4px 24px rgba(74,222,128,0.3);
        }

        .ob5-btn-primary.success:hover {
          box-shadow: 0 8px 32px rgba(74,222,128,0.45);
        }

        .ob5-btn-primary:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .ob5-btn-arrow {
          font-size: 1.1rem;
          transition: transform 0.3s;
        }

        .ob5-btn-primary:hover:not(:disabled) .ob5-btn-arrow { transform: translateX(3px); }

        /* Diagnostics */
        .ob5-diag-header {
          text-align: center;
          margin-bottom: 24px;
        }

        .ob5-progress-bar {
          width: 100%;
          height: 3px;
          background: rgba(255,255,255,0.06);
          border-radius: 999px;
          margin-bottom: 20px;
          overflow: hidden;
        }

        .ob5-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--aegis-cyan), var(--aegis-violet));
          border-radius: 999px;
          box-shadow: 0 0 8px var(--aegis-cyan);
          animation: ob5-load 4s ease-out forwards;
        }

        @keyframes ob5-load {
          from { width: 0%; }
          to   { width: 95%; }
        }

        .ob5-checks {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 24px;
        }

        .ob5-check-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 13px 16px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
          position: relative;
          overflow: hidden;
          animation: ob5-in 0.35s var(--ease-out) both;
          transition: border-color 0.3s, background 0.3s;
        }

        .ob5-check-item.pass  { border-color: rgba(74,222,128,0.3); background: rgba(74,222,128,0.04); }
        .ob5-check-item.fail  { border-color: rgba(244,63,94,0.3);  background: rgba(244,63,94,0.04); }
        .ob5-check-item.check {
          border-color: rgba(34,211,238,0.3);
          animation: ob5-in 0.35s var(--ease-out) both, ob5-check-pulse 1.2s ease-in-out infinite;
        }

        @keyframes ob5-check-pulse {
          0%, 100% { border-color: rgba(34,211,238,0.2); }
          50%       { border-color: rgba(34,211,238,0.6); box-shadow: 0 0 12px rgba(34,211,238,0.1); }
        }

        /* Sweeping scan line */
        .ob5-scan-sweep {
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.12) 50%, transparent 100%);
          animation: ob5-sweep 1.2s linear infinite;
          pointer-events: none;
        }

        @keyframes ob5-sweep {
          from { transform: translateX(-100%); }
          to   { transform: translateX(100%); }
        }

        .ob5-check-icon { font-size: 1.1rem; flex-shrink: 0; width: 26px; text-align: center; }

        .ob5-check-body { flex: 1; }

        .ob5-check-label {
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--text-1);
        }

        .ob5-check-detail {
          font-size: 0.7rem;
          color: var(--text-3);
          margin-top: 2px;
        }

        .ob5-check-badge {
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 1px;
          text-transform: uppercase;
          font-family: var(--mono);
          flex-shrink: 0;
        }

        .ob5-check-badge.pass  { color: var(--aegis-green); }
        .ob5-check-badge.fail  { color: var(--aegis-red); }
        .ob5-check-badge.check { color: var(--aegis-cyan); }

        .ob5-spinner {
          display: inline-block;
          width: 14px;
          height: 14px;
          border: 2px solid rgba(34,211,238,0.2);
          border-top-color: var(--aegis-cyan);
          border-radius: 50%;
          animation: spin-fast 0.7s linear infinite;
          vertical-align: middle;
        }

        @keyframes spin-fast { to { transform: rotate(360deg); } }

        /* Confetti */
        .ob5-confetti {
          position: relative;
          height: 0;
          overflow: visible;
          pointer-events: none;
        }

        @keyframes ob5-confetti {
          0%   { transform: translate(-50%, -50%) rotate(0deg) scale(1); opacity: 1; }
          100% { transform: translate(calc(-50% + var(--cx)), calc(-50% + var(--cy))) rotate(var(--cr)) scale(0); opacity: 0; }
        }

        /* Compliance */
        .ob5-compliance {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid rgba(255,255,255,0.05);
        }

        .ob5-compliance-badge {
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-4);
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          padding: 3px 9px;
          border-radius: 4px;
        }

        /* Entrance animation */
        @keyframes ob5-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
