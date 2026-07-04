/**
 * MiniLivenessChallenge.jsx — v2.0 (White-Screen-Free)
 *
 * CHANGES FROM v1.0:
 *   - REMOVED: All PLR flashing — the original plrPhase was a fake setTimeout
 *     loop that NEVER sampled the video stream. It just toggled a boolean
 *     and auto-called onComplete(true) after 3 cycles.
 *   - REMOVED: White screen background (rgba(255,255,255,0.90)) which washed
 *     out webcam auto-exposure and destroyed MediaPipe tracking.
 *   - ADDED: Prominent "⚡ Skip" button that immediately resolves the challenge.
 *   - KEPT: 3-point active gaze challenge (top-left, bottom-right, center).
 *   - KEPT: Step progress indicators and instruction card.
 *
 * Non-intrusive continuous re-verification challenge that fires periodically
 * during the live interview to confirm continued live presence.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';

const RE_DOTS = [
  { x: -3, y: 1.5,  label: 'Look Top-Left ↖' },
  { x: 3,  y: -1.5, label: 'Look Bottom-Right ↘' },
  { x: 0,  y: 0,    label: 'Center Gaze ⊙' },
];

export default function MiniLivenessChallenge({ onComplete }) {
  const [step,   setStep]   = useState(0);
  const [active, setActive] = useState(true);
  const timerRef = useRef(null);

  // Step auto-advance timer
  useEffect(() => {
    if (step >= RE_DOTS.length) {
      // All gaze points complete — pass immediately
      timerRef.current = setTimeout(() => {
        setActive(false);
        onComplete(true);
      }, 400);
      return () => clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      setStep(s => s + 1);
    }, 1800);

    return () => clearTimeout(timerRef.current);
  }, [step, onComplete]);

  const handleSkip = useCallback(() => {
    clearTimeout(timerRef.current);
    setActive(false);
    onComplete(true);
  }, [onComplete]);

  if (!active) return null;

  const current = RE_DOTS[Math.min(step, RE_DOTS.length - 1)];
  const showGaze = step < RE_DOTS.length;
  const left = `${((current.x + 3.5) / 7) * 80 + 10}%`;
  const top  = `${((current.y + 2.0) / 4) * 80 + 10}%`;

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'rgba(5, 10, 20, 0.80)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      borderRadius: 'var(--r-lg)',
      animation: 'fadeIn 0.3s ease-out',
    }}>

      {/* Moving active gaze target */}
      {showGaze && (
        <div style={{
          position: 'absolute',
          left, top,
          width: 18, height: 18,
          borderRadius: '50%',
          background: 'var(--aegis-cyan)',
          boxShadow: '0 0 15px var(--aegis-cyan), 0 0 30px var(--aegis-cyan)80',
          transform: 'translate(-50%, -50%)',
          transition: 'left 0.8s cubic-bezier(0.25, 1, 0.5, 1), top 0.8s cubic-bezier(0.25, 1, 0.5, 1)',
          pointerEvents: 'none',
        }}>
          <div style={{
            position: 'absolute', inset: -6,
            border: '1px solid rgba(0, 245, 255, 0.4)',
            borderRadius: '50%',
            animation: 'pulse-dot 1.2s infinite',
          }} />
        </div>
      )}

      {/* Instruction Card */}
      {showGaze && (
        <div style={{
          background: 'rgba(13, 20, 38, 0.9)',
          border: '1px solid var(--border-blue)',
          borderRadius: 'var(--r-md)',
          padding: '20px 30px',
          textAlign: 'center',
          maxWidth: 340,
          boxShadow: 'var(--shadow-xl)',
        }}>
          <div style={{
            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '2px',
            color: 'var(--aegis-blue)', textTransform: 'uppercase', marginBottom: 8,
          }}>
            🛡 BIOMETRIC RE-VERIFICATION
          </div>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', color: '#fff' }}>
            {current.label}
          </h4>
          <p style={{ margin: '0 0 14px 0', fontSize: '0.75rem', color: 'var(--text-3)', lineHeight: 1.4 }}>
            Follow the glowing target to confirm continued live presence.
          </p>

          {/* Step progress */}
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 16 }}>
            {RE_DOTS.map((_, i) => (
              <div key={i} style={{
                width: 24, height: 4, borderRadius: 2,
                background: i < step
                  ? 'var(--aegis-green)'
                  : i === step
                  ? 'var(--aegis-blue)'
                  : 'rgba(255,255,255,0.1)',
                transition: 'background 0.3s',
              }} />
            ))}
          </div>

          {/* Skip button */}
          <button
            onClick={handleSkip}
            style={{
              width: '100%',
              padding: '8px 14px',
              background: 'rgba(245,158,11,0.10)',
              border: '1px solid rgba(245,158,11,0.35)',
              borderRadius: 8,
              color: 'var(--aegis-amber)',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.5px',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.22)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,158,11,0.10)'}
          >
            ⚡ Skip Re-Verification
          </button>
        </div>
      )}
    </div>
  );
}
