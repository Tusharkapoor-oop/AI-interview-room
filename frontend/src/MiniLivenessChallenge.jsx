import { useState, useEffect, useRef, useCallback } from 'react';
import { useAegisStore } from './useAegisStore';

const RE_DOTS = [
  { x: -3, y: 1.5,  label: 'Look Top-Left ↖' },
  { x: 3,  y: -1.5, label: 'Look Bottom-Right ↘' },
  { x: 0,  y: 0,    label: 'Center Gaze ⊙' },
];

const GAZE_MATCH_THRESHOLD = 0.15;

export default function MiniLivenessChallenge({ onComplete }) {
  const telemetry = useAegisStore(s => s.telemetry);

  const [step,      setStep]      = useState(0);
  const [active,    setActive]    = useState(true);
  const [validated, setValidated] = useState(Array(RE_DOTS.length).fill(false));
  const timerRef = useRef(null);
  const validatedRef = useRef(Array(RE_DOTS.length).fill(false));

  // Step auto-advance timer (independent of gaze validation)
  useEffect(() => {
    if (step >= RE_DOTS.length) {
      const allValid = validatedRef.current.every(Boolean);
      timerRef.current = setTimeout(() => {
        setActive(false);
        onComplete(allValid);
      }, allValid ? 400 : 2000);
      return () => clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      setStep(s => s + 1);
    }, 2000);

    return () => clearTimeout(timerRef.current);
  }, [step, onComplete]);

  // Gaze validation via backend telemetry (runs on every telemetry update)
  useEffect(() => {
    if (step >= RE_DOTS.length) return;
    if (!telemetry?.eye_gaze) return;
    if (validatedRef.current[step]) return;

    const current = RE_DOTS[step];
    const expectedHN = current.x / 60;
    const expectedVN = -current.y / 40;
    const dist = Math.hypot(
      telemetry.eye_gaze.h - expectedHN,
      telemetry.eye_gaze.v - expectedVN
    );

    if (dist < GAZE_MATCH_THRESHOLD) {
      validatedRef.current[step] = true;
      setValidated([...validatedRef.current]);
    }
  }, [telemetry, step]);

  const handleSkip = useCallback(() => {
    clearTimeout(timerRef.current);
    setActive(false);
    onComplete(false);
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

      {showGaze && (
        <div style={{
          position: 'absolute',
          left, top,
          width: 18, height: 18,
          borderRadius: '50%',
          background: validated[step] ? 'var(--aegis-green)' : 'var(--aegis-cyan)',
          boxShadow: validated[step]
            ? '0 0 15px var(--aegis-green), 0 0 30px var(--aegis-green)80'
            : '0 0 15px var(--aegis-cyan), 0 0 30px var(--aegis-cyan)80',
          transform: 'translate(-50%, -50%)',
          transition: 'left 0.8s cubic-bezier(0.25, 1, 0.5, 1), top 0.8s cubic-bezier(0.25, 1, 0.5, 1)',
          pointerEvents: 'none',
        }}>
          <div style={{
            position: 'absolute', inset: -6,
            border: `1px solid ${validated[step] ? 'rgba(16,185,129,0.4)' : 'rgba(0, 245, 255, 0.4)'}`,
            borderRadius: '50%',
            animation: 'pulse-dot 1.2s infinite',
          }} />
        </div>
      )}

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

          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 16 }}>
            {RE_DOTS.map((_, i) => (
              <div key={i} style={{
                width: 24, height: 4, borderRadius: 2,
                background: validated[i]
                  ? 'var(--aegis-green)'
                  : i < step
                  ? 'var(--aegis-amber)'
                  : i === step
                  ? 'var(--aegis-blue)'
                  : 'rgba(255,255,255,0.1)',
                transition: 'background 0.3s',
              }} />
            ))}
          </div>

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
