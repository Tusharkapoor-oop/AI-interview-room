/**
 * HITLPanel.jsx
 * Human-in-the-Loop decision modal for recruiters.
 * Appears when the Hub sends a HITL escalation:
 *  - HITL_ESCALATION: integrity score dropped below threshold
 *  - HITL_CODE_PLAGIARISM: code plagiarism detected
 * 
 * Recruiter must approve/reject within 30 seconds.
 * Auto-resolves to CONTINUE if no action is taken.
 * PRD §6: Risk Management — Human review mandatory for score < 80.
 */
import React, { useEffect, useRef, useState } from 'react';

const SEVERITY_META = {
  HITL_ESCALATION:     { icon: '🚨', color: 'var(--aegis-red)',   title: 'Integrity Alert' },
  HITL_CODE_PLAGIARISM:{ icon: '⚠️', color: 'var(--aegis-amber)', title: 'Plagiarism Detected' },
  default:             { icon: '🛡️', color: 'var(--aegis-blue)',  title: 'Action Required' },
};

const OPTION_META = {
  CONTINUE:        { label: 'Continue Interview', icon: '▶', cls: 'safe'   },
  WARN_CANDIDATE:  { label: 'Warn Candidate',     icon: '⚠', cls: 'warn'   },
  TERMINATE:       { label: 'Terminate Session',  icon: '✕', cls: 'danger' },
  IGNORE:          { label: 'Ignore Flag',        icon: '○', cls: 'safe'   },
  FLAG_FOR_REVIEW: { label: 'Flag for Review',    icon: '⚑', cls: 'warn'   },
};

export default function HITLPanel({ event, onDecision }) {
  const [timeLeft, setTimeLeft]   = useState(event?.expires || 30);
  const [resolved, setResolved]   = useState(false);
  const intervalRef = useRef(null);
  const handleDecisionRef = useRef(null);

  const meta = SEVERITY_META[event?.type] || SEVERITY_META.default;

  const handleDecision = (action, auto = false) => {
    if (resolved) return;
    setResolved(true);
    clearInterval(intervalRef.current);
    onDecision?.({ action, auto, session_id: event?.session_id });
  };

  useEffect(() => {
    handleDecisionRef.current = handleDecision;
  }, [handleDecision]);

  useEffect(() => {
    if (!event || resolved) return;

    intervalRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(intervalRef.current);
          // Auto-resolve to CONTINUE
          handleDecisionRef.current?.('CONTINUE', true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [event, resolved]);

  if (!event) return null;

  const options = event.options || ['CONTINUE'];
  const urgencyPct = (timeLeft / (event.expires || 30)) * 100;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2,5,7,0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        animation: 'card-in 0.3s var(--ease-out)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Human-in-the-Loop decision required"
    >
      <div style={{
        width: 480,
        background: 'var(--surface)',
        border: `1px solid ${meta.color}`,
        borderRadius: 'var(--r-xl)',
        padding: 'var(--space-8)',
        boxShadow: `0 0 40px ${meta.color}30, var(--shadow-lg)`,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 'var(--r-md)',
            background: `${meta.color}15`, border: `1px solid ${meta.color}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.4rem',
          }} aria-hidden="true">{meta.icon}</div>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-1)' }}>
              {meta.title}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
              HITL Gate — Recruiter Action Required
            </div>
          </div>
        </div>

        {/* Message */}
        <div style={{
          padding: '12px 16px',
          background: `${meta.color}08`,
          border: `1px solid ${meta.color}25`,
          borderRadius: 'var(--r-md)',
          marginBottom: 20,
          fontSize: '0.88rem',
          color: 'var(--text-1)',
          lineHeight: 1.6,
        }}>
          {event.message}
          {event.score !== undefined && (
            <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: '0.8rem', color: meta.color }}>
              Current Integrity Score: <strong>{event.score}</strong>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {options.map(opt => {
            const om = OPTION_META[opt] || { label: opt, icon: '○', cls: 'safe' };
            const isDestructive = om.cls === 'danger';
            const isWarn = om.cls === 'warn';
            return (
              <button
                key={opt}
                onClick={() => handleDecision(opt)}
                disabled={resolved}
                id={`hitl-${opt.toLowerCase().replace(/_/g, '-')}-btn`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 16px',
                  borderRadius: 'var(--r-md)',
                  border: `1px solid ${isDestructive ? 'var(--aegis-red)' : isWarn ? 'var(--aegis-amber)' : 'var(--border)'}`,
                  background: isDestructive ? 'rgba(239,68,68,0.08)' : isWarn ? 'rgba(255,159,28,0.08)' : 'var(--card)',
                  color: isDestructive ? 'var(--aegis-red)' : isWarn ? 'var(--aegis-amber)' : 'var(--text-1)',
                  fontFamily: 'var(--font)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: resolved ? 'not-allowed' : 'pointer',
                  opacity: resolved ? 0.5 : 1,
                  transition: 'all 0.15s ease',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: '1rem', width: 20, textAlign: 'center' }} aria-hidden="true">{om.icon}</span>
                {om.label}
                {isDestructive && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.65rem', letterSpacing: '1px', textTransform: 'uppercase', opacity: 0.7 }}>
                    IRREVERSIBLE
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Countdown bar */}
        {!resolved && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.7rem', color: 'var(--text-3)' }}>
              <span>Auto-continues in {timeLeft}s if no action taken</span>
              <span style={{ color: timeLeft <= 10 ? 'var(--aegis-red)' : 'var(--text-3)', fontFamily: 'var(--mono)' }}>
                {timeLeft}s
              </span>
            </div>
            <div style={{ height: 4, background: 'var(--border)', borderRadius: 'var(--r-full)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${urgencyPct}%`,
                background: timeLeft <= 10 ? 'var(--aegis-red)' : meta.color,
                borderRadius: 'var(--r-full)',
                transition: 'width 1s linear, background 0.3s ease',
              }} />
            </div>
          </div>
        )}

        {/* Resolution state */}
        {resolved && (
          <div style={{
            textAlign: 'center',
            padding: '10px',
            background: 'rgba(16,185,129,0.06)',
            border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: 'var(--r-md)',
            fontSize: '0.82rem',
            color: 'var(--aegis-green)',
            fontWeight: 600,
          }}>
            ✓ Decision recorded and logged
          </div>
        )}
      </div>
    </div>
  );
}
