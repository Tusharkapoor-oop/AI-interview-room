/**
 * MiniLivenessChallenge.jsx — Layer 2: Continuous Verification (Re-challenge)
 *
 * Non-intrusive 3-point active gaze challenge + quick 3-flash PLR check.
 * Paper §PLR: mini version fires 3 flash cycles to confirm live pupil response.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';

const RE_DOTS = [
  { x: -3, y: 1.5, label: 'Look Top-Left ↖' },
  { x: 3, y: -1.5, label: 'Look Bottom-Right ↘' },
  { x: 0, y: 0, label: 'Center Gaze ⊙' }
];

const MINI_PLR_CYCLES = 3;
const MINI_PLR_MS     = 500; // ms per flash phase

export default function MiniLivenessChallenge({ onComplete }) {
  const [step, setStep]       = useState(0);
  const [active, setActive]   = useState(true);
  // Mini PLR state
  const [plrPhase, setPlrPhase] = useState(null); // null | 'running' | 'done'
  const [plrFlash, setPlrFlash] = useState(false); // true=bright, false=dark
  const [plrCycle, setPlrCycle] = useState(0);
  const timerRef = useRef(null);

  // Gaze challenge step timer
  useEffect(() => {
    if (step >= RE_DOTS.length) {
      // Gaze complete — start mini PLR
      setPlrPhase('running');
      setPlrCycle(0);
      return;
    }

    timerRef.current = setTimeout(() => {
      setStep(s => s + 1);
    }, 1800);

    return () => clearTimeout(timerRef.current);
  }, [step]);

  // Mini PLR flash loop
  useEffect(() => {
    if (plrPhase !== 'running') return;
    if (plrCycle >= MINI_PLR_CYCLES * 2) {
      // Done
      setPlrPhase('done');
      setPlrFlash(false);
      timerRef.current = setTimeout(() => {
        setActive(false);
        onComplete(true);
      }, 400);
      return;
    }
    setPlrFlash(plrCycle % 2 === 0); // even = bright, odd = dark
    timerRef.current = setTimeout(() => {
      setPlrCycle(c => c + 1);
    }, MINI_PLR_MS);
    return () => clearTimeout(timerRef.current);
  }, [plrPhase, plrCycle, onComplete]);

  if (!active) return null;

  const showGaze = step < RE_DOTS.length;
  const current  = RE_DOTS[Math.min(step, RE_DOTS.length - 1)];
  const left = `${((current.x + 3.5) / 7) * 80 + 10}%`;
  const top  = `${((current.y + 2.0) / 4) * 80 + 10}%`;

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: plrPhase === 'running'
        ? (plrFlash ? 'rgba(255,255,255,0.90)' : 'rgba(0,0,0,0.90)')
        : 'rgba(5, 10, 20, 0.75)',
      backdropFilter: plrPhase === 'running' ? 'none' : 'blur(6px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      borderRadius: 'var(--r-lg)',
      animation: 'fadeIn 0.3s ease-out',
      transition: `background ${MINI_PLR_MS * 0.3}ms ease-in-out`,
    }}>
      {/* PLR flash label */}
      {plrPhase === 'running' && (
        <div style={{
          position: 'absolute', top: 20,
          fontSize: '0.65rem', fontWeight: 700, letterSpacing: '2px',
          color: plrFlash ? '#000' : '#fff', textTransform: 'uppercase',
          transition: 'color 0.15s',
        }}>
          👁 PLR CHECK — {Math.floor(plrCycle / 2) + 1}/{MINI_PLR_CYCLES}
        </div>
      )}

      {/* Moving active gaze target (gaze phase only) */}
      {showGaze && (
        <div style={{
          position: 'absolute',
          left, top,
          width: 18, height: 18,
          borderRadius: '50%',
          background: 'var(--aegis-cyan)',
          boxShadow: '0 0 15px var(--aegis-cyan), 0 0 30px var(--aegis-cyan)80',
          transform: 'translate(-50%, -50%)',
          transition: 'left 0.8s cubic-bezier(0.25, 1, 0.5, 1), top 0.8s cubic-bezier(0.25, 1, 0.5, 1)'
        }}>
          <div style={{
            position: 'absolute',
            inset: -6,
            border: '1px solid rgba(0, 245, 255, 0.4)',
            borderRadius: '50%',
            animation: 'pulse-dot 1.2s infinite'
          }} />
        </div>
      )}

      {/* Instruction Card (gaze phase only) */}
      {showGaze && (
        <div style={{
          background: 'rgba(13, 20, 38, 0.9)',
          border: '1px solid var(--border-blue)',
          borderRadius: 'var(--r-md)',
          padding: '20px 30px',
          textAlign: 'center',
          maxWidth: 320,
          boxShadow: 'var(--shadow-xl)',
          pointerEvents: 'none'
        }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '2px', color: 'var(--aegis-blue)', textTransform: 'uppercase', marginBottom: 8 }}>
            🛡 BIOMETRIC RE-VERIFICATION
          </div>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', color: '#fff' }}>
            {current.label}
          </h4>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-3)', lineHeight: 1.4 }}>
            Follow the target, then a quick 3-flash PLR check will confirm live presence.
          </p>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 12 }}>
            {RE_DOTS.map((_, i) => (
              <div key={i} style={{
                width: 24, height: 4, borderRadius: 2,
                background: i < step ? 'var(--aegis-green)' : i === step ? 'var(--aegis-blue)' : 'rgba(255,255,255,0.1)'
              }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
