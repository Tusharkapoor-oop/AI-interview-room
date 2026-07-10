/**
 * SpeakerVerificationPanel.jsx — Voice Fingerprint Match Display
 *
 * Paper §"Auditory Forensics / Speaker Verification":
 *   Shows the enrolled voice profile fingerprint (13-bin spectral bars),
 *   live speaker match score, and verification status.
 */
import React, { useEffect, useState } from 'react';
import { useAegisStore } from './useAegisStore';

// ── Voice Fingerprint Visualizer ─────────────────────────────────────────────
function VoiceFingerprint({ profile, liveFeatures, color }) {
  if (!profile || profile.length === 0) return null;

  const max = Math.max(...profile, 1);

  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 40 }}>
      {profile.map((val, i) => {
        const heightPct = (val / max) * 100;
        const liveVal   = liveFeatures?.[i];
        const liveH     = liveVal ? Math.min((liveVal / max) * 100, 100) : null;
        return (
          <div key={i} style={{ flex: 1, position: 'relative', height: '100%', display: 'flex', alignItems: 'flex-end' }}>
            {/* Enrolled (background) bar */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              height: `${heightPct}%`,
              background: `${color}30`,
              border: `1px solid ${color}50`,
              borderRadius: '2px 2px 0 0',
              transition: 'height 0.3s',
            }} />
            {/* Live bar overlay */}
            {liveH !== null && (
              <div style={{
                position: 'absolute', bottom: 0, left: '25%', right: '25%',
                height: `${liveH}%`,
                background: color,
                borderRadius: '2px 2px 0 0',
                opacity: 0.8,
                transition: 'height 0.2s',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Match Score Gauge ────────────────────────────────────────────────────────
function MatchGauge({ score }) {
  if (score === null) return null;
  const color = score >= 80 ? 'var(--aegis-green)' : score >= 65 ? 'var(--aegis-amber)' : 'var(--aegis-red)';
  const label = score >= 80 ? 'MATCH' : score >= 65 ? 'PARTIAL' : 'MISMATCH';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${score}%`,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          borderRadius: 3,
          transition: 'width 0.6s ease, background 0.4s',
        }} />
      </div>
      <div style={{
        fontFamily: 'var(--mono)', fontWeight: 800, fontSize: '0.8rem',
        color, minWidth: 36, textAlign: 'right',
      }}>
        {score}%
      </div>
      <div style={{
        fontSize: '0.58rem', fontWeight: 700, letterSpacing: '1px',
        color, background: `${color}18`,
        padding: '2px 6px', borderRadius: 99, minWidth: 56, textAlign: 'center',
      }}>
        {label}
      </div>
    </div>
  );
}

// ── Main Panel ───────────────────────────────────────────────────────────────
export default function SpeakerVerificationPanel({ matchScore }) {
  const { voiceProfile, speakerMatchScore } = useAegisStore();

  const score    = matchScore ?? speakerMatchScore;
  const enrolled = voiceProfile && voiceProfile.length > 0;
  const color    = !score ? '#4a5c7a'
                 : score >= 80 ? 'var(--aegis-green)'
                 : score >= 65 ? 'var(--aegis-amber)'
                 : 'var(--aegis-red)';

  // Animate a fake "live" fingerprint overlay for visual effect
  const [liveSim, setLiveSim] = useState(null);
  useEffect(() => {
    if (!enrolled || !score) return;
    const id = setInterval(() => {
      // Simulate slight variation around the enrolled profile
      setLiveSim(voiceProfile.map(v => v * (0.85 + Math.random() * 0.3)));
    }, 500);
    return () => clearInterval(id);
  }, [enrolled, score, voiceProfile]);

  return (
    <div className="mini-metric" style={{
      border: `1px solid ${enrolled && score !== null
        ? (score >= 80 ? 'rgba(16,185,129,0.3)' : score >= 65 ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.35)')
        : 'var(--border)'}`,
      transition: 'border-color 0.5s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div className="mini-metric-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span>🎙️</span> Speaker ID
        </div>
        <div style={{
          fontSize: '0.58rem', fontWeight: 700, letterSpacing: '1px',
          textTransform: 'uppercase',
          color: enrolled ? 'var(--aegis-green)' : 'var(--aegis-amber)',
          background: enrolled ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
          padding: '2px 7px', borderRadius: 99,
        }}>
          {enrolled ? '✓ Enrolled' : '○ Not Enrolled'}
        </div>
      </div>

      {/* Voice fingerprint */}
      {enrolled ? (
        <>
          <div style={{ marginBottom: 4 }}>
            <VoiceFingerprint profile={voiceProfile} liveFeatures={liveSim} color={color} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.58rem', color: 'var(--text-3)', marginBottom: 8 }}>
            <span>80Hz</span>
            <span style={{ color: 'var(--text-3)' }}>← 13-bin spectral profile →</span>
            <span>8kHz</span>
          </div>
        </>
      ) : (
        <div style={{
          height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.7rem', color: 'var(--text-3)',
          background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 8,
        }}>
          Voice profile pending enrollment
        </div>
      )}

      {/* Match score */}
      {score !== null ? (
        <MatchGauge score={score} />
      ) : (
        <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', textAlign: 'center' }}>
          {enrolled ? 'Awaiting speech…' : 'Enroll in calibration step'}
        </div>
      )}

      {/* Info note */}
      <div style={{
        marginTop: 7, fontSize: '0.6rem', color: 'var(--text-3)', lineHeight: 1.4,
        padding: '4px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 4,
      }}>
        Paper §Audio Forensics — cosine similarity on 13-bin MFCC proxy.
        Checks every 20s for voice substitution.
      </div>
    </div>
  );
}
