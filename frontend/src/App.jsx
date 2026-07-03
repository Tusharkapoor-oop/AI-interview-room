/**
 * App.jsx — Aegis Interview Room v5.0
 *
 * Phase router:
 *   landing → onboard → mode_select → identity → liveness → env_scan
 *   → calibration → interview (AI) OR human_interviewer (Human) → report
 *   → recruiter (Admin / Command Center)
 *   → security_dashboard (live-accessible from nav)
 *   → ide
 */
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './i18n';

import { useAegisStore } from './useAegisStore';
import AegisToast              from './AegisToast';
import LuxLanding              from './lux-concierge/LuxConciergeApp';
import './lux-concierge/mountLuxLanding';
import OnboardScreen           from './OnboardScreen';
import InterviewerModeSelector from './InterviewerModeSelector';
import IdentityVerification    from './IdentityVerification';
import LivenessChallenge       from './LivenessChallenge';
import EnvironmentScan         from './EnvironmentScan';
import CalibrationScreen       from './CalibrationScreen';
import InterviewArena          from './InterviewArena';
import HumanInterviewerPanel   from './HumanInterviewerPanel';
import CommandCenter           from './CommandCenter';
import IDEView                 from './IDEView';
import ScoreReport             from './ScoreReport';
import SecurityDashboard       from './SecurityDashboard';

const LANGUAGES = [
  { code: 'en', label: '🇺🇸 EN' },
  { code: 'es', label: '🇪🇸 ES' },
  { code: 'zh', label: '🇨🇳 ZH' },
  { code: 'hi', label: '🇮🇳 HI' },
  { code: 'fr', label: '🇫🇷 FR' },
  { code: 'de', label: '🇩🇪 DE' },
  { code: 'ja', label: '🇯🇵 JA' },
  { code: 'ar', label: '🇦🇪 AR' },
];

// Candidate sequential flow (landing is before this)
const CANDIDATE_PHASES = ['onboard', 'mode_select', 'identity', 'liveness', 'env_scan', 'calibration', 'interview', 'report'];
const PHASE_LABELS = {
  landing:            'Welcome',
  onboard:            'Setup',
  mode_select:        'Mode',
  identity:           'Identity',
  liveness:           'Liveness',
  env_scan:           'Env Scan',
  calibration:        'Calibration',
  interview:          'Interview',
  report:             'Report',
  recruiter:          'Command Center',
  ide:                'Live IDE',
  human_interviewer:  'Interviewer Panel',
  security_dashboard: 'Security Intel',
};

// Mode colour map
const MODE_COLORS = {
  ai:    'var(--primary-light)',
  human: 'var(--info)',
  admin: 'var(--aegis-amber)',
};

// ── Top Navigation Bar ───────────────────────────────────────────────────────
function TopBar() {
  const {
    phase, setPhase, integrityScore, language, setLanguage,
    candidateName, sessionConfig, interviewMode,
  } = useAegisStore();
  const { i18n } = useTranslation();
  useEffect(() => { i18n.changeLanguage(language); }, [language]);

  // Hide top bar on landing phase entirely
  if (phase === 'landing') return null;

  const isCandidateFlow = CANDIDATE_PHASES.includes(phase);
  const isAdminView     = ['recruiter', 'ide', 'human_interviewer'].includes(phase);
  const isSecDash       = phase === 'security_dashboard';
  const modeColor       = MODE_COLORS[interviewMode] || 'var(--aegis-cyan)';

  return (
    <nav className="top-bar" role="navigation" aria-label="Aegis platform navigation">
      {/* Brand */}
      <div className="brand" aria-label="Aegis Interview Room">
        <div className="brand-shield" aria-hidden="true">⬡</div>
        <div className="brand-text">
          <div className="brand-name">Aegis</div>
          <div className="brand-sub">Interview Room · v4.2</div>
        </div>
      </div>

      {/* Phase breadcrumb — candidate flow */}
      {isCandidateFlow && !isSecDash && (
        <div className="phase-indicator" role="progressbar">
          {CANDIDATE_PHASES.map((p, i) => {
            const currentIdx = CANDIDATE_PHASES.indexOf(phase);
            const isDone   = i < currentIdx;
            const isActive = p === phase;
            return (
              <React.Fragment key={p}>
                <div
                  className={`phase-step ${isActive ? 'active' : isDone ? 'done' : 'locked'}`}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => isDone && setPhase(p)}
                  style={isActive ? { borderColor: modeColor, color: modeColor } : {}}
                >
                  {isDone ? '✓' : `${i + 1}`} {PHASE_LABELS[p]}
                </div>
                {i < CANDIDATE_PHASES.length - 1 && <span className="phase-sep">›</span>}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Admin / Recruiter / Human-Interviewer nav */}
      {(isAdminView && !isSecDash) && (
        <div className="phase-indicator">
          <button
            className={`phase-step ${phase === 'recruiter' ? 'active' : 'done'}`}
            onClick={() => setPhase('recruiter')}
          >🎯 Command Center</button>
          <button
            className={`phase-step ${phase === 'human_interviewer' ? 'active' : 'done'}`}
            onClick={() => setPhase('human_interviewer')}
          >👤 Interviewer</button>
          <button
            className={`phase-step ${phase === 'ide' ? 'active' : 'done'}`}
            onClick={() => setPhase('ide')}
          >💻 Live IDE</button>
          <button className="phase-step" onClick={() => setPhase('interview')} style={{ opacity: 0.6 }}>
            ← Interview
          </button>
        </div>
      )}

      {/* Security Dashboard breadcrumb */}
      {isSecDash && (
        <div className="phase-indicator">
          <button className="phase-step done" onClick={() => setPhase('onboard')}>← Back</button>
          <span className="phase-sep">›</span>
          <div className="phase-step active" style={{ borderColor: 'var(--aegis-red)', color: 'var(--aegis-red)' }}>
            ☠ Security Intel
          </div>
        </div>
      )}

      {/* Right controls */}
      <div className="bar-right">
        {/* Interview mode badge */}
        {interviewMode && phase !== 'onboard' && phase !== 'mode_select' && (
          <div style={{
            fontSize: '0.62rem', fontWeight: 800, padding: '3px 10px', borderRadius: 99,
            color: modeColor, background: `color-mix(in srgb, ${modeColor} 14%, transparent)`,
            border: `1px solid color-mix(in srgb, ${modeColor} 30%, transparent)`, letterSpacing: '0.5px',
          }}>
            {interviewMode === 'ai' ? '🤖 AI' : interviewMode === 'human' ? '👤 Human' : '⚙ Admin'} Mode
          </div>
        )}

        {/* Candidate name */}
        {(phase === 'interview' || phase === 'report' || phase === 'human_interviewer') && candidateName && (
          <div className="candidate-pill">
            <span className="candidate-avatar">{candidateName[0]?.toUpperCase()}</span>
            <span>{candidateName}</span>
            {sessionConfig?.seniority && (
              <span className="candidate-level">{sessionConfig.seniority}</span>
            )}
          </div>
        )}

        {/* Integrity score */}
        {(['interview', 'human_interviewer', 'recruiter'].includes(phase)) && (
          <div
            className="integrity-pill"
            style={{
              color: useAegisStore.getState().integrityScore < 50
                ? 'var(--aegis-red)' : useAegisStore.getState().integrityScore < 80
                ? 'var(--aegis-amber)' : 'var(--aegis-green)'
            }}
          >
            🔒 {integrityScore}%
          </div>
        )}

        {/* Security Dashboard button — always visible */}
        <button
          id="nav-security-dashboard"
          onClick={() => setPhase('security_dashboard')}
          style={{
            padding: '5px 12px', borderRadius: 8,
            background: phase === 'security_dashboard'
              ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${phase === 'security_dashboard' ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.25)'}`,
            color: 'var(--aegis-red)', fontSize: '0.68rem', fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.2s',
          }}
        >
          ☠ Security
        </button>

        <div className="live-badge">
          <span className="live-dot" />
          LIVE
        </div>

        <select
          className="lang-btn"
          value={language}
          onChange={e => setLanguage(e.target.value)}
          aria-label="Interview language"
        >
          {LANGUAGES.map(l => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>

        {phase === 'interview' && (
          <button
            className="btn-secondary"
            style={{ padding: '4px 12px', fontSize: '0.72rem' }}
            onClick={() => setPhase('recruiter')}
          >
            Recruiter View →
          </button>
        )}
      </div>
    </nav>
  );
}

// ── Session Timer ─────────────────────────────────────────────────────────────
function SessionTimer() {
  const { phase, tickSession } = useAegisStore();
  useEffect(() => {
    if (!['interview', 'human_interviewer', 'recruiter', 'ide'].includes(phase)) return;
    const t = setInterval(tickSession, 1000);
    return () => clearInterval(t);
  }, [phase]);
  return null;
}

// ── Phase Router ─────────────────────────────────────────────────────────────
function PhaseView() {
  const { phase, setPhase } = useAegisStore();
  switch (phase) {
    case 'landing':             return <LuxLanding onComplete={() => setPhase('onboard')} onDirectEnter={() => setPhase('onboard')} onSecurityDash={() => setPhase('security_dashboard')} />;
    case 'onboard':             return <OnboardScreen />;
    case 'mode_select':         return <InterviewerModeSelector />;
    case 'identity':            return <IdentityVerification />;
    case 'liveness':            return <LivenessChallenge />;
    case 'env_scan':            return <EnvironmentScan />;
    case 'calibration':         return <CalibrationScreen />;
    case 'interview':           return <InterviewArena />;
    case 'human_interviewer':   return <HumanInterviewerPanel />;
    case 'report':              return <ScoreReport />;
    case 'recruiter':           return <CommandCenter />;
    case 'ide':                 return <IDEView />;
    case 'security_dashboard':  return <SecurityDashboard />;
    default:                    return <LuxLanding onComplete={() => setPhase('onboard')} onDirectEnter={() => setPhase('onboard')} onSecurityDash={() => setPhase('security_dashboard')} />;
  }
}

// ── THE STRICTEST PROTOCOL IN THE WORLD (Mandatory Lockout Overlay) ───────────
function StrictMandatoryOverlay() {
  const { strictMandatoryLockdown, mandatoryLockdownReason, resetMandatoryLockdown, setPhase } = useAegisStore();
  if (!strictMandatoryLockdown) return null;

  return (
    <div className="strict-mandatory-overlay" role="alertdialog" aria-modal="true" aria-labelledby="strict-title">
      <div className="strict-mandatory-card">
        <div style={{ fontSize: '4rem', marginBottom: '16px', filter: 'drop-shadow(0 0 20px #ef4444)' }}>🚨</div>
        <h1 id="strict-title" style={{ color: '#ef4444', fontFamily: 'var(--lux-font-serif)', fontSize: '2.4rem', fontWeight: 900, letterSpacing: '0.05em', marginBottom: '8px' }}>
          MANDATORY PROTOCOL TERMINATION
        </h1>
        <div style={{ color: 'var(--aegis-amber)', fontFamily: 'var(--mono)', fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.12em', marginBottom: '24px' }}>
          THE STRICTEST BIOMETRIC SECURITY PROTOCOL IN THE WORLD ENFORCED
        </div>
        <p style={{ color: 'var(--text-1)', fontSize: '1.05rem', lineHeight: 1.6, marginBottom: '28px', background: 'rgba(0,0,0,0.4)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.3)' }}>
          {mandatoryLockdownReason || 'Forensic integrity compromised. Zero-tolerance enforcement triggered.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px' }}>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', fontFamily: 'var(--mono)' }}>
            ENFORCEMENT VERDICT: IRREVERSIBLE TERMINATION · NO RE-ENTRY PERMITTED
          </span>
          <span style={{ color: '#ef4444', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.2em' }}>
            AEGIS FORENSIC PROCTORING · ISO/IEC 27001 LEVEL 4
          </span>

          <button
            onClick={() => {
              resetMandatoryLockdown();
            }}
            style={{
              marginTop: '16px',
              padding: '14px 20px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              border: '1px solid rgba(96,165,250,0.4)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: 'pointer',
              boxShadow: '0 0 20px rgba(37,99,235,0.4)',
              transition: 'all 0.2s ease'
            }}
          >
            ⚡ Evaluator Override: Dismiss Protocol Termination & Resume →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <div className="aegis-shell" role="application" style={{ width: '100%', maxWidth: '100vw', overflowX: 'hidden' }}>
      <StrictMandatoryOverlay />
      <SessionTimer />
      <TopBar />
      <PhaseView />
      <AegisToast />
    </div>
  );
}
