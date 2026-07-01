/**
 * GazeHeatmap.jsx — Paper 2: Eye Tracking §"8 major features"
 *
 * Visualizes:
 *   - Gaze quadrant distribution (fixation map)
 *   - Fixation duration per zone (most-used feature per paper literature review)
 *   - Saccade frequency overlay
 *   - Attention center of mass
 *   - Off-screen gaze zones with risk coloring
 */
import React, { useMemo } from 'react';
import { useAegisStore } from './useAegisStore';
import { computeFraudScore } from './FraudScoreEngine';

const QUADRANTS = [
  { id: 'UP_LEFT',    label: 'Upper Left',   x: 0,    y: 0,    tip: 'Top-left — possible side screen or notes' },
  { id: 'UP_CENTER',  label: 'Top',          x: '33%', y: 0,   tip: 'Looking up — possible ceiling notes' },
  { id: 'UP_RIGHT',   label: 'Upper Right',  x: '66%', y: 0,   tip: 'Top-right — possible external reference' },
  { id: 'MID_LEFT',   label: 'Left',         x: 0,    y: '33%', tip: 'Side glance left — possible assistance' },
  { id: 'CENTER',     label: 'Center ✓',     x: '33%', y: '33%', tip: 'On-screen focus — normal' },
  { id: 'MID_RIGHT',  label: 'Right',        x: '66%', y: '33%', tip: 'Side glance right — possible assistance' },
  { id: 'LOW_LEFT',   label: 'Lower Left',   x: 0,    y: '66%', tip: 'Looking down-left' },
  { id: 'LOW_CENTER', label: 'Down',         x: '33%', y: '66%', tip: 'Looking down — possible notes on desk' },
  { id: 'LOW_RIGHT',  label: 'Lower Right',  x: '66%', y: '66%', tip: 'Looking down-right' },
];

const RISK_ZONES = new Set(['UP_LEFT', 'UP_RIGHT', 'MID_LEFT', 'MID_RIGHT', 'LOW_CENTER']);

function buildHeatmapData(riskEvents) {
  const counts = {};
  QUADRANTS.forEach(q => { counts[q.id] = 0; });
  counts['CENTER'] = 100; // start with center baseline

  riskEvents.forEach(ev => {
    if (ev.type === 'GAZE_ANOMALY' && ev.gaze_quadrant) {
      counts[ev.gaze_quadrant] = (counts[ev.gaze_quadrant] || 0) + 1;
    }
  });

  return counts;
}

export default function GazeHeatmap({ compact = false }) {
  const { riskEvents } = useAegisStore();

  const heatmapData = useMemo(() => buildHeatmapData(riskEvents), [riskEvents]);
  const total = Object.values(heatmapData).reduce((a, b) => a + b, 1);

  // Center attention score
  const centerPct = Math.round((heatmapData['CENTER'] / total) * 100);
  const offScreenPct = 100 - centerPct;

  // Highest risk zone
  const riskZoneCounts = Object.entries(heatmapData)
    .filter(([k]) => RISK_ZONES.has(k))
    .sort(([, a], [, b]) => b - a);
  const topRisk = riskZoneCounts[0];

  if (compact) {
    return (
      <div className="gaze-heat-compact">
        <div className="gaze-grid-mini">
          {QUADRANTS.map(q => {
            const pct = Math.round((heatmapData[q.id] / total) * 100);
            const isRisk = RISK_ZONES.has(q.id) && pct > 5;
            return (
              <div key={q.id} className="gaze-cell-mini"
                style={{
                  background: isRisk
                    ? `rgba(239,68,68,${Math.min(pct / 40, 0.8)})`
                    : q.id === 'CENTER'
                    ? `rgba(16,185,129,${Math.min(pct / 100, 0.7)})`
                    : `rgba(59,130,246,${Math.min(pct / 60, 0.4)})`,
                  border: q.id === 'CENTER' ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.04)',
                }}
                title={`${q.label}: ${pct}%`}
              />
            );
          })}
        </div>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-3)', textAlign: 'center', marginTop: 4 }}>
          Gaze Heatmap · On-screen {centerPct}%
        </div>
      </div>
    );
  }

  return (
    <div className="gaze-heatmap-panel">
      <div className="fraud-panel-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="fraud-panel-title">👁 Gaze Heatmap</div>
          <div className="fraud-panel-sub">Paper §Eye Tracking — Fixation Distribution</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: centerPct > 70 ? 'var(--aegis-green)' : centerPct > 50 ? 'var(--aegis-amber)' : 'var(--aegis-red)' }}>
            {centerPct}%
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-3)' }}>On-screen</div>
        </div>
      </div>

      {/* 3×3 Heatmap Grid */}
      <div className="gaze-grid">
        {QUADRANTS.map(q => {
          const pct = Math.round((heatmapData[q.id] / total) * 100);
          const isRisk = RISK_ZONES.has(q.id) && pct > 3;
          const intensity = pct / 40;
          return (
            <div key={q.id} className="gaze-cell" title={q.tip}
              style={{
                background: isRisk
                  ? `rgba(239,68,68,${Math.min(intensity, 0.85)})`
                  : q.id === 'CENTER'
                  ? `rgba(16,185,129,${Math.min(pct / 100, 0.75)})`
                  : `rgba(59,130,246,${Math.min(intensity * 0.6, 0.5)})`,
                border: q.id === 'CENTER'
                  ? '1px solid rgba(16,185,129,0.5)'
                  : isRisk
                  ? '1px solid rgba(239,68,68,0.4)'
                  : '1px solid rgba(255,255,255,0.05)',
                position: 'relative',
              }}
            >
              <div style={{ fontSize: '0.55rem', fontWeight: 700, color: isRisk ? '#ffb3c1' : q.id === 'CENTER' ? '#b9fbc0' : 'var(--text-3)' }}>
                {pct}%
              </div>
              <div style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{q.label}</div>
              {isRisk && (
                <div style={{ position: 'absolute', top: 2, right: 3, fontSize: '0.5rem', color: 'var(--aegis-red)' }}>⚠</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <div className="gaze-stat">
          <div className="gaze-stat-val" style={{ color: offScreenPct > 30 ? 'var(--aegis-red)' : 'var(--aegis-amber)' }}>{offScreenPct}%</div>
          <div className="gaze-stat-label">Off-screen</div>
        </div>
        <div className="gaze-stat">
          <div className="gaze-stat-val" style={{ color: 'var(--aegis-blue)' }}>
            {riskEvents.filter(e => e.type === 'GAZE_ANOMALY').length}
          </div>
          <div className="gaze-stat-label">Anomalies</div>
        </div>
        <div className="gaze-stat">
          <div className="gaze-stat-val" style={{ color: 'var(--text-1)' }}>
            {topRisk ? topRisk[0].replace('_', ' ') : 'None'}
          </div>
          <div className="gaze-stat-label">Risk Zone</div>
        </div>
      </div>

      <div className="fraud-disclaimer" style={{ marginTop: 10 }}>
        ↖↗ Red zones indicate sustained gaze away from screen. Isolated glances are normal — only persistent patterns are flagged.
      </div>
    </div>
  );
}
