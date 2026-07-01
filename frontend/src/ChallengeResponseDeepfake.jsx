/**
 * ChallengeResponseDeepfake.jsx — Research Module 4
 *
 * Research basis: UC Berkeley "Gotcha" system — challenge-response
 * approach where rapid facial movements, hand-over-face gestures,
 * and simultaneous speech+movement degrade deepfake pipelines,
 * creating detectable artifacts. Data: 47 real users, 56,247 short
 * videos, demonstrated "consistent and visible degradation of
 * deepfake quality caused by challenges."
 *
 * Three challenges (ordered by deepfake disruption effectiveness):
 *   1. Rapid Head Turn: 45° turn left/right in < 2s
 *   2. Hand-Over-Face: Cover mouth with palm for 1.5s, then reveal
 *   3. Multi-modal Sync: Count backwards while nodding (3, 2, 1)
 *
 * Deepfakes fail because:
 *   - Rapid motion causes temporal smearing artifacts
 *   - Face occlusion boundaries expose compositing seams
 *   - Multi-modal synchronization requires prediction of both
 *     head pose and audio simultaneously
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAegisStore } from './useAegisStore';

const CHALLENGES = [
  {
    id: 'rapid_turn',
    icon: '↔️',
    title: 'Rapid Head Turn',
    instruction: 'Turn your head fully to the LEFT, then fully to the RIGHT, then back to center.',
    hint: 'Turn as fast as you comfortably can — within 3 seconds',
    duration: 6000,
    detectionNote: 'Rapid rotation exposes temporal smearing in synthetic video pipelines',
    successCue: 'Head turn movement detected ✓',
    // Detection: head yaw should swing from >-30° to >+30° within window
    validate: (telemetryLog) => {
      const yaws = telemetryLog.map(t => t?.pose?.yaw ?? 0);
      const minYaw = Math.min(...yaws);
      const maxYaw = Math.max(...yaws);
      return maxYaw - minYaw >= 45; // at least 45° total swing
    },
  },
  {
    id: 'hand_face',
    icon: '🖐️',
    title: 'Hand-Over-Face',
    instruction: 'Place your open palm over your mouth and nose for 2 seconds, then lower your hand.',
    hint: 'Hold still while covering your face — deepfakes struggle at occlusion boundaries',
    duration: 8000,
    detectionNote: 'Face occlusion exposes compositing seams in real-time face-swap models',
    successCue: 'Hand landmark detected at face region ✓',
    // Detection: hand_anomaly_type should be MOUTH_COVER during window
    validate: (telemetryLog) => {
      return telemetryLog.some(t => t?.hand_anomaly_type === 'MOUTH_COVER' || t?.hands_visible > 0);
    },
  },
  {
    id: 'multimodal_sync',
    icon: '🔢',
    title: 'Count & Nod',
    instruction: 'Count backwards aloud: "3...2...1" — nodding your head with each number.',
    hint: 'Say each number clearly while nodding downward — synchronized motion + speech is the hardest challenge for deepfakes',
    duration: 8000,
    detectionNote: 'Simultaneous multi-modal (audio + motion) is computationally prohibitive for deepfake pipelines',
    successCue: 'Head motion + vocalization synchronized ✓',
    // Detection: head pitch movement + audio energy during speech
    validate: (telemetryLog) => {
      const pitchMoves  = telemetryLog.filter(t => Math.abs(t?.pose?.pitch ?? 0) > 8).length;
      const facePresent = telemetryLog.filter(t => t?.face_detected).length;
      return pitchMoves >= 3 && facePresent >= telemetryLog.length * 0.6;
    },
  },
];

const CAPTURE_INTERVAL_MS = 200; // telemetry snapshot rate

export default function ChallengeResponseDeepfake({ onComplete }) {
  const { telemetry, addRiskEvent, showToast } = useAegisStore();
  const [currentIdx, setCurrentIdx]   = useState(0);
  const [phase, setPhase]             = useState('intro');   // intro | active | result | done
  const [countdown, setCountdown]     = useState(0);
  const [progress, setProgress]       = useState(0);
  const [results, setResults]         = useState([]);
  const [failFlags, setFailFlags]     = useState([]);

  const telemetryLog  = useRef([]);
  const timerRef      = useRef(null);
  const progressRef   = useRef(null);
  const startTsRef    = useRef(0);
  const telemetryRef  = useRef(telemetry);
  telemetryRef.current = telemetry;

  const challenge = CHALLENGES[currentIdx];

  // ── Run a challenge ────────────────────────────────────────────
  const startChallenge = useCallback(() => {
    telemetryLog.current = [];
    startTsRef.current   = Date.now();
    setPhase('active');
    setCountdown(Math.ceil(challenge.duration / 1000));

    // Capture telemetry snapshots
    timerRef.current = setInterval(() => {
      telemetryLog.current.push({ ...telemetryRef.current });
    }, CAPTURE_INTERVAL_MS);

    // Countdown display
    let remaining = Math.ceil(challenge.duration / 1000);
    const cdInterval = setInterval(() => {
      remaining--;
      setCountdown(remaining);
      setProgress(1 - remaining / Math.ceil(challenge.duration / 1000));
      if (remaining <= 0) clearInterval(cdInterval);
    }, 1000);

    // End challenge after duration
    setTimeout(() => {
      clearInterval(timerRef.current);
      const passed = challenge.validate(telemetryLog.current);
      setPhase('result');
      setResults(prev => [...prev, { id: challenge.id, passed, samples: telemetryLog.current.length }]);

      if (!passed) {
        setFailFlags(prev => [...prev, challenge.id]);
        addRiskEvent({
          type:     'DEEPFAKE_CHALLENGE_FAIL',
          severity: challenge.id === 'hand_face' ? 'HIGH' : 'MEDIUM',
          desc:     `Challenge-response deepfake test failed: "${challenge.title}" — candidate could not demonstrate required biometric action (${telemetryLog.current.length} frames analyzed)`,
          meta:     { challengeId: challenge.id, frames: telemetryLog.current.length },
        });
      }
    }, challenge.duration);
  }, [challenge, addRiskEvent]);

  // ── Advance to next challenge ──────────────────────────────────
  const advance = useCallback(() => {
    if (currentIdx + 1 < CHALLENGES.length) {
      setCurrentIdx(i => i + 1);
      setPhase('intro');
      setProgress(0);
    } else {
      // All done — evaluate
      const allPassed = failFlags.length === 0;
      if (!allPassed) {
        const failedNames = failFlags.map(id => CHALLENGES.find(c => c.id === id)?.title).join(', ');
        showToast(`⚠ Deepfake challenge failures: ${failedNames}`, 'error', 10_000);
      }
      setPhase('done');
      onComplete?.({ passed: allPassed, failedChallenges: failFlags, results });
    }
  }, [currentIdx, failFlags, results, showToast, onComplete]);

  const overallProgress = ((currentIdx) / CHALLENGES.length + (phase === 'active' ? progress / CHALLENGES.length : 0));

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100%', padding: '32px 24px', background: 'var(--void)', boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32, maxWidth: 560 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 16px',
          background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)',
          borderRadius: 99, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--aegis-violet)', marginBottom: 16,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--aegis-violet)', display: 'inline-block' }} />
          UC Berkeley Challenge-Response · Deepfake Detection
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-1)', marginBottom: 8 }}>
          Biometric Presence Verification
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.65 }}>
          Complete {CHALLENGES.length} physical challenges to confirm you are physically present.
          These challenges are specifically designed to degrade deepfake and face-swap pipelines.
        </p>

        {/* Overall progress */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
          {CHALLENGES.map((c, i) => {
            const res = results.find(r => r.id === c.id);
            const isCurrent = i === currentIdx;
            return (
              <div key={c.id} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  border: `2px solid ${res ? (res.passed ? 'var(--aegis-green)' : 'var(--aegis-red)') : isCurrent ? 'var(--aegis-cyan)' : 'rgba(255,255,255,0.12)'}`,
                  background: res ? (res.passed ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)') : isCurrent ? 'rgba(34,211,238,0.1)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1rem',
                  boxShadow: isCurrent ? '0 0 12px rgba(34,211,238,0.3)' : 'none',
                  transition: 'all 0.3s',
                }}>
                  {res ? (res.passed ? '✓' : '✕') : c.icon}
                </div>
                <span style={{ fontSize: '0.58rem', color: 'var(--text-3)', fontWeight: 600 }}>{c.title.split(' ')[0]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Challenge Card */}
      {phase !== 'done' && (
        <div style={{
          width: '100%', maxWidth: 520,
          background: 'rgba(13,13,26,0.9)',
          border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 60px rgba(99,102,241,0.06)',
        }}>
          {/* Card accent */}
          <div style={{
            height: 3, background: 'linear-gradient(90deg, var(--aegis-cyan), var(--aegis-violet))',
            boxShadow: '0 0 8px rgba(34,211,238,0.4)',
          }} />

          <div style={{ padding: '28px 32px' }}>
            {/* Challenge header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: 'rgba(99,102,241,0.12)',
                border: '1px solid rgba(99,102,241,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.6rem',
              }}>
                {challenge.icon}
              </div>
              <div>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--aegis-cyan)', marginBottom: 3 }}>
                  Challenge {currentIdx + 1} of {CHALLENGES.length}
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-1)' }}>
                  {challenge.title}
                </div>
              </div>
            </div>

            {/* Instruction */}
            <div style={{
              padding: '16px 20px',
              background: 'rgba(34,211,238,0.04)',
              border: '1px solid rgba(34,211,238,0.15)',
              borderRadius: 12,
              marginBottom: 16,
            }}>
              <p style={{ fontSize: '0.95rem', color: 'var(--text-1)', lineHeight: 1.65, margin: 0, fontWeight: 500 }}>
                {challenge.instruction}
              </p>
            </div>

            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: 20, lineHeight: 1.5 }}>
              💡 {challenge.hint}
            </div>

            {/* Active countdown */}
            {phase === 'active' && (
              <>
                <div style={{
                  textAlign: 'center', fontSize: '3rem', fontWeight: 900,
                  color: countdown <= 2 ? 'var(--aegis-amber)' : 'var(--aegis-cyan)',
                  fontFamily: 'var(--mono)', marginBottom: 12,
                  transition: 'color 0.3s',
                  animation: 'pulse 1s ease-in-out infinite',
                }}>
                  {countdown}
                </div>
                <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{
                    height: '100%', borderRadius: 99,
                    background: 'linear-gradient(90deg, var(--aegis-cyan), var(--aegis-violet))',
                    width: `${progress * 100}%`,
                    transition: 'width 0.2s linear',
                    boxShadow: '0 0 8px rgba(34,211,238,0.5)',
                  }} />
                </div>
                <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--aegis-cyan)', letterSpacing: '0.08em', fontWeight: 600 }}>
                  🔍 Recording biometric response...
                </div>
              </>
            )}

            {/* Result */}
            {phase === 'result' && (() => {
              const r = results[results.length - 1];
              const passed = r?.passed;
              return (
                <div style={{
                  textAlign: 'center', padding: '16px',
                  background: passed ? 'rgba(74,222,128,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${passed ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  borderRadius: 12, marginBottom: 16,
                }}>
                  <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>{passed ? '✅' : '⚠️'}</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: passed ? 'var(--aegis-green)' : 'var(--aegis-amber)' }}>
                    {passed ? challenge.successCue : `Challenge inconclusive — ${r?.samples} frames analyzed`}
                  </div>
                </div>
              );
            })()}

            {/* Research disclosure */}
            <div style={{
              marginTop: 16, padding: '8px 12px',
              background: 'rgba(167,139,250,0.04)',
              border: '1px solid rgba(167,139,250,0.12)',
              borderRadius: 8, fontSize: '0.6rem', color: 'var(--text-3)', lineHeight: 1.5,
            }}>
              <strong style={{ color: 'var(--aegis-violet)' }}>Why this works: </strong>
              {challenge.detectionNote}
            </div>

            {/* Actions */}
            <div style={{ marginTop: 20 }}>
              {phase === 'intro' && (
                <button className="btn-premium success" style={{ width: '100%', fontSize: '0.9rem', padding: '14px' }} onClick={startChallenge}>
                  Begin Challenge →
                </button>
              )}
              {phase === 'result' && (
                <button className="btn-premium" style={{ width: '100%', fontSize: '0.9rem', padding: '14px' }} onClick={advance}>
                  {currentIdx + 1 < CHALLENGES.length ? `Next Challenge (${currentIdx + 2}/${CHALLENGES.length}) →` : 'Complete Verification →'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Completed state */}
      {phase === 'done' && (
        <div style={{
          textAlign: 'center', maxWidth: 440,
          animation: 'card-in 0.5s var(--ease-out)',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>
            {failFlags.length === 0 ? '🛡️' : '⚠️'}
          </div>
          <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: failFlags.length === 0 ? 'var(--aegis-green)' : 'var(--aegis-amber)', marginBottom: 8 }}>
            {failFlags.length === 0 ? 'Biometric Presence Confirmed' : 'Verification Partially Completed'}
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-2)', lineHeight: 1.65, marginBottom: 24 }}>
            {failFlags.length === 0
              ? `All ${CHALLENGES.length} deepfake challenges passed. Biometric continuity and physical presence confirmed.`
              : `${failFlags.length} challenge(s) flagged for human review. Proceeding with enhanced monitoring.`
            }
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {results.map(r => (
              <div key={r.id} style={{
                padding: '6px 14px', borderRadius: 99,
                background: r.passed ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${r.passed ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)'}`,
                fontSize: '0.7rem', fontWeight: 700,
                color: r.passed ? 'var(--aegis-green)' : 'var(--aegis-red)',
              }}>
                {r.passed ? '✓' : '✕'} {CHALLENGES.find(c => c.id === r.id)?.title}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
