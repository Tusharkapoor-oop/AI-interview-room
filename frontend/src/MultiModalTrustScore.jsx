/**
 * MultiModalTrustScore.jsx — Research Module 7 Update
 * Research basis: "Multi-modal fusion synchronizes eye movement data with
 * speech-to-text engines, sentiment analysis (BERT, RoBERTa), and voice
 * stress analysis" (Report §4.2)
 *
 * New in v2.0:
 *   - COMPOUND_RISK detection: 3+ distinct signals within 30s = compound event
 *   - 5 new research signals integrated into behavioral layer score
 *   - Signal fusion visualization row in expanded view
 */
import React, { useMemo, useEffect, useRef } from 'react';
import { useAegisStore } from './useAegisStore';
import { computeFraudScore } from './FraudScoreEngine';

// ── Compound risk detection ─────────────────────────────────────────────────
// "When 3+ signals fire within 30s window → COMPOUND_RISK event" (report §4.2)
const COMPOUND_WINDOW_MS = 30_000;
const COMPOUND_THRESHOLD  = 3;

// All research-grade signal types that count toward compound risk
const RESEARCH_SIGNALS = new Set([
  'GAZE_ANOMALY', 'GAZE_READING_PATTERN', 'GAZE_DEVIATION_ANGLE',
  'AI_LATENCY_SIGNATURE', 'LLM_PHRASEOLOGY_DETECTED',
  'HAND_ANOMALY', 'SECONDARY_VOICE_DETECTED', 'FACE_CONSISTENCY_FAIL',
  'VIRTUAL_MACHINE_DETECTED', 'DEEPFAKE_CHALLENGE_FAIL',
  'AI_API_CALL', 'EXTENSION_DETECTED', 'SYNTHETIC_INPUT',
]);

const LAYER_WEIGHTS = {
  identity:      0.20,   // Identity verified, face match, voiceprint
  liveness:      0.15,   // Pupillary response passed
  behavioral:    0.25,   // Gaze, head pose, attention — highest weight per paper
  environment:   0.15,   // Room scan, no secondary person
  digital:       0.15,   // Tab switches, paste anomalies
  fraud:         0.10,   // Composite fraud model
};

function ScoreArc({ score, size = 80, strokeW = 6 }) {
  const r = (size - strokeW) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? 'var(--aegis-green)' : score >= 60 ? '#4cc9f0' : score >= 40 ? 'var(--aegis-amber)' : 'var(--aegis-red)';

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r}
        fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeW} />
      <circle cx={size/2} cy={size/2} r={r}
        fill="none" stroke={color} strokeWidth={strokeW}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)', filter: `drop-shadow(0 0 4px ${color})` }}
      />
    </svg>
  );
}

export default function MultiModalTrustScore({ compact = false }) {
  const { riskEvents, identityData, sessionSeconds, addRiskEvent } = useAegisStore();
  const compoundFiredRef = useRef(new Set()); // track compound events to avoid duplicates

  const { score: fraudScore } = useMemo(
    () => computeFraudScore(riskEvents, sessionSeconds),
    [riskEvents, sessionSeconds]
  );

  // ── Compound signal detection (Research §4.2) ───────────────────────
  useEffect(() => {
    if (!riskEvents?.length) return;
    const now = Date.now();
    const windowStart = now - COMPOUND_WINDOW_MS;

    // Find distinct signal types that fired within the window
    const recentTypes = new Set(
      riskEvents
        .filter(e => RESEARCH_SIGNALS.has(e.type) && (e.id || 0) > windowStart)
        .map(e => e.type)
    );

    if (recentTypes.size >= COMPOUND_THRESHOLD) {
      const key = [...recentTypes].sort().join('|');
      if (!compoundFiredRef.current.has(key)) {
        compoundFiredRef.current.add(key);
        addRiskEvent({
          type:     'COMPOUND_RISK',
          severity: 'CRITICAL',
          desc:     `Compound fraud signal: ${recentTypes.size} independent detection channels triggered within 30s — [${[...recentTypes].join(' + ')}]. Probability of legitimate candidate: very low.`,
          meta:     { signals: [...recentTypes], windowMs: COMPOUND_WINDOW_MS },
        });
        // Clear key after 2 minutes to allow re-triggering
        setTimeout(() => compoundFiredRef.current.delete(key), 120_000);
      }
    }
  }, [riskEvents, addRiskEvent]);

  // Compute per-layer scores
  const layerScores = useMemo(() => {
    const gaze = riskEvents.filter(e => [
      'GAZE_ANOMALY', 'ATTENTION_DRIFT', 'HEAD_TURN',
      'GAZE_READING_PATTERN', 'GAZE_DEVIATION_ANGLE',  // NEW research signals
    ].includes(e.type));
    const digital = riskEvents.filter(e => [
      'TAB_SWITCH', 'PASTE_ANOMALY', 'TYPING_ANOMALY', 'DEVTOOLS_OPEN', 'WINDOW_BLUR',
      'VIRTUAL_MACHINE_DETECTED', 'VIRTUAL_MACHINE_SUSPECTED',              // NEW
    ].includes(e.type));
    const env = riskEvents.filter(e => ['SECONDARY_PERSON', 'OBJECT_DETECTED', 'ENV_SCAN_SKIPPED', 'LIGHTING_ANOMALY'].includes(e.type));
    const nlp = riskEvents.filter(e => [
      'LLM_PHRASEOLOGY_DETECTED', 'AI_LATENCY_SIGNATURE',                  // NEW research signals
    ].includes(e.type));
    const deepfake = riskEvents.filter(e => [
      'DEEPFAKE_CHALLENGE_FAIL', 'RPPG_NO_HEARTBEAT', 'FACE_CONSISTENCY_FAIL',
    ].includes(e.type));

    return {
      identity:    Math.max(40, 100 - (identityData?.selfieVerified === false ? 30 : 0) - (identityData?.deviceClean === false ? 20 : 0) - (identityData?.virtualCameraDetected ? 30 : 0)),
      liveness:    Math.max(50, 100 - (identityData?.livenessFailed ? 40 : 0) - deepfake.length * 15),
      behavioral:  Math.max(20, 100 - gaze.length * 7 - (gaze.some(e => e.severity === 'HIGH' || e.severity === 'CRITICAL') ? 20 : 0) - nlp.length * 10),
      environment: Math.max(30, 100 - env.length * 15),
      digital:     Math.max(20, 100 - digital.length * 10),
      fraud:       Math.max(0, 100 - fraudScore),
    };
  }, [riskEvents, fraudScore, identityData]);

  // Compound risk indicator
  const compoundRisk = riskEvents.filter(e => e.type === 'COMPOUND_RISK');
  const hasCompound  = compoundRisk.length > 0;

  // Weighted composite
  const compositeScore = useMemo(() => {
    return Math.round(
      Object.entries(LAYER_WEIGHTS).reduce((sum, [key, w]) => sum + (layerScores[key] || 100) * w, 0)
    );
  }, [layerScores]);

  const verdict =
    compositeScore >= 85 ? { label: 'HIGH TRUST', color: 'var(--aegis-green)' } :
    compositeScore >= 65 ? { label: 'MODERATE TRUST', color: '#4cc9f0' } :
    compositeScore >= 45 ? { label: 'LOW TRUST', color: 'var(--aegis-amber)' } :
    { label: 'VERY LOW TRUST', color: 'var(--aegis-red)' };

  const layers = [
    { key: 'identity',    label: 'Identity',    icon: '🪪', desc: 'ID + Face + Voiceprint' },
    { key: 'liveness',    label: 'Liveness',    icon: '👁', desc: 'Pupillary response + blink' },
    { key: 'behavioral',  label: 'Behavioral',  icon: '🧠', desc: 'Gaze + Head + Attention' },
    { key: 'environment', label: 'Environment', icon: '🏠', desc: 'Room + Objects + Persons' },
    { key: 'digital',     label: 'Digital',     icon: '🔒', desc: 'Tab + Paste + DevTools' },
    { key: 'fraud',       label: 'Fraud Model', icon: '🤖', desc: 'AI multi-modal scoring' },
  ];

  if (compact) {
    return (
      <div className="trust-compact">
        <div style={{ position: 'relative', width: 56, height: 56 }}>
          <ScoreArc score={compositeScore} size={56} strokeW={5} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 900, color: verdict.color, lineHeight: 1 }}>{compositeScore}</div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: verdict.color }}>{verdict.label}</div>
          <div style={{ fontSize: '0.56rem', color: 'var(--text-3)' }}>Multi-Modal Trust</div>
        </div>
      </div>
    );
  }

  return (
    <div className="trust-panel">
      <div className="fraud-panel-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="fraud-panel-title">🧬 Multi-Modal Trust Score</div>
          <div className="fraud-panel-sub">7-Layer Composite · Paper §9 Future Research</div>
        </div>
        <div style={{ position: 'relative', width: 70, height: 70 }}>
          <ScoreArc score={compositeScore} size={70} strokeW={6} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <div style={{ fontSize: '1rem', fontWeight: 900, color: verdict.color, lineHeight: 1 }}>{compositeScore}</div>
            <div style={{ fontSize: '0.45rem', color: 'var(--text-3)' }}>/ 100</div>
          </div>
        </div>
      </div>

      <div className="trust-verdict" style={{ background: `${verdict.color}10`, border: `1px solid ${verdict.color}30` }}>
        <span style={{ color: verdict.color, fontWeight: 800 }}>{verdict.label}</span>
        <span style={{ fontSize: '0.62rem', color: 'var(--text-3)' }}>ADVISORY</span>
      </div>

      {/* Compound risk alert */}
      {hasCompound && (
        <div style={{
          margin: '10px 0', padding: '8px 12px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.35)',
          borderRadius: 8,
          fontSize: '0.65rem', color: 'var(--aegis-red)',
          fontWeight: 700, lineHeight: 1.5,
        }}>
          ⛔ COMPOUND RISK: {compoundRisk.length} compound event{compoundRisk.length > 1 ? 's' : ''} — multiple independent detection channels confirmed simultaneously
        </div>
      )}

      {/* Per-layer breakdown */}
      <div style={{ marginTop: 14 }}>
        {layers.map(l => {
          const s = layerScores[l.key] || 100;
          const w = LAYER_WEIGHTS[l.key];
          const barColor = s >= 80 ? 'var(--aegis-green)' : s >= 60 ? 'var(--aegis-blue)' : s >= 40 ? 'var(--aegis-amber)' : 'var(--aegis-red)';
          return (
            <div key={l.key} className="trust-layer-row">
              <span className="trust-layer-icon">{l.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-1)' }}>{l.label}</span>
                  <span style={{ fontSize: '0.68rem', fontFamily: 'var(--mono)', color: barColor }}>{s}</span>
                </div>
                <div className="trust-layer-bar">
                  <div style={{ width: `${s}%`, height: '100%', background: barColor, borderRadius: 2, transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
                </div>
                <div style={{ fontSize: '0.55rem', color: 'var(--text-4)', marginTop: 2 }}>{l.desc} · weight {(w * 100).toFixed(0)}%</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="fraud-disclaimer" style={{ marginTop: 12 }}>
        ⚠ Trust score is advisory only. No hiring decision is made automatically. Human review is required for all outcomes below 65.
      </div>
    </div>
  );
}
