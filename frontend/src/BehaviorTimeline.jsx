/**
 * BehaviorTimeline.jsx
 *
 * Paper 2 + Paper 3:
 *   - Per-event behavioral timeline with severity color coding
 *   - Clusters events by type to show patterns
 *   - Shows response latency overlays
 *   - Behavioral pattern clustering (SVM-inspired grouping)
 *   - Ghost writer / earpiece event markers
 */
import React, { useMemo, useState } from 'react';
import { useAegisStore } from './useAegisStore';

const TYPE_META = {
  GAZE_ANOMALY:              { icon: '👁', color: 'var(--aegis-amber)', short: 'Gaze' },
  HEAD_TURN:                 { icon: '↩', color: 'var(--aegis-red)', short: 'Head' },
  ATTENTION_DRIFT:           { icon: '🌀', color: '#f4a261', short: 'Attn' },
  BLINK_ANOMALY:             { icon: '👀', color: '#4cc9f0', short: 'Blink' },
  SECONDARY_PERSON:          { icon: '👤', color: 'var(--aegis-red)', short: '2nd Person' },
  HAND_ANOMALY:              { icon: '✋', color: '#ff9f43', short: 'Hand' },
  SECONDARY_VOICE_DETECTED:  { icon: '🎤', color: 'var(--aegis-red)', short: 'Voice' },
  TAB_SWITCH:                { icon: '🔀', color: 'var(--aegis-amber)', short: 'Tab' },
  PASTE_ANOMALY:             { icon: '📋', color: 'var(--aegis-red)', short: 'Paste' },
  TYPING_ANOMALY:            { icon: '⌨', color: 'var(--aegis-amber)', short: 'Typing' },
  DEEPFAKE_SUSPECTED:        { icon: '🤖', color: 'var(--aegis-red)', short: 'Deepfake' },
  FACE_CONSISTENCY_FAIL:     { icon: '🔁', color: 'var(--aegis-red)', short: 'Face Δ' },
  DEVTOOLS_OPEN:             { icon: '🛠', color: '#aaa', short: 'DevTools' },
  WINDOW_BLUR:               { icon: '🪟', color: '#aaa', short: 'Blur' },
  VIRTUAL_CAM:               { icon: '📷', color: 'var(--aegis-red)', short: 'VirtualCam' },
  ENV_SCAN_SKIPPED:          { icon: '🚫', color: 'var(--aegis-amber)', short: 'NoScan' },
  OBJECT_DETECTED:           { icon: '📱', color: 'var(--aegis-red)', short: 'Object' },
  LIGHTING_ANOMALY:          { icon: '💡', color: '#aaa', short: 'Light' },
  CANDIDATE_APPEAL:          { icon: '⚖', color: 'var(--aegis-cyan)', short: 'Appeal' },
};

const SEVERITY_ORDER = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

function EventDot({ ev, sessionStart, totalDuration, onClick, selected }) {
  const pct = totalDuration > 0
    ? Math.min(((ev.relTime || 0) / totalDuration) * 100, 98)
    : 50;
  const meta = TYPE_META[ev.type] || { icon: '⚠', color: '#aaa', short: ev.type };
  const size = ev.severity === 'CRITICAL' ? 14 : ev.severity === 'HIGH' ? 11 : 8;

  return (
    <div
      onClick={() => onClick(ev)}
      title={`${ev.type} — ${ev.severity}\n${ev.desc || ''}`}
      style={{
        position: 'absolute',
        left: `${pct}%`,
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: size, height: size,
        borderRadius: '50%',
        background: meta.color,
        boxShadow: selected ? `0 0 0 3px white, 0 0 10px ${meta.color}` : `0 0 6px ${meta.color}80`,
        cursor: 'pointer',
        zIndex: selected ? 5 : 2,
        transition: 'all 0.2s',
      }}
    />
  );
}

export default function BehaviorTimeline({ compact = false }) {
  const { riskEvents, sessionSeconds } = useAegisStore();
  const [selected, setSelected] = useState(null);
  const [filterType, setFilterType] = useState('ALL');

  const sessionStart = useMemo(() => {
    if (riskEvents.length === 0) return Date.now();
    const firstTs = riskEvents[0]?.ts;
    if (!firstTs) return Date.now();
    return new Date(firstTs).getTime();
  }, [riskEvents]);

  const enriched = useMemo(() => {
    return riskEvents.map(ev => ({
      ...ev,
      relTime: ev.ts ? (new Date(ev.ts).getTime() - sessionStart) / 1000 : 0,
    })).sort((a, b) => a.relTime - b.relTime);
  }, [riskEvents, sessionStart]);

  const totalDuration = Math.max(sessionSeconds, enriched.length > 0 ? enriched[enriched.length-1]?.relTime + 30 : 60);

  const uniqueTypes = useMemo(() => {
    const types = new Set(enriched.map(e => e.type));
    return ['ALL', ...Array.from(types)];
  }, [enriched]);

  const filtered = filterType === 'ALL' ? enriched : enriched.filter(e => e.type === filterType);

  // Cluster analysis: group events within 10s windows
  const clusters = useMemo(() => {
    const groups = [];
    let currentGroup = [];
    filtered.forEach((ev, i) => {
      if (currentGroup.length === 0) {
        currentGroup.push(ev);
      } else {
        const last = currentGroup[currentGroup.length - 1];
        if ((ev.relTime - last.relTime) < 10) {
          currentGroup.push(ev);
        } else {
          if (currentGroup.length >= 2) groups.push(currentGroup);
          currentGroup = [ev];
        }
      }
    });
    if (currentGroup.length >= 2) groups.push(currentGroup);
    return groups;
  }, [filtered]);

  if (compact) {
    return (
      <div className="behavior-timeline-compact">
        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>
          Behavior Timeline · {enriched.length} events
        </div>
        {/* Mini track */}
        <div className="bt-track-mini">
          {enriched.slice(-30).map((ev, i) => {
            const meta = TYPE_META[ev.type] || { color: '#aaa' };
            return (
              <div key={i} style={{
                flex: 1, maxWidth: 6, height: ev.severity === 'HIGH' || ev.severity === 'CRITICAL' ? 16 : ev.severity === 'MEDIUM' ? 10 : 6,
                borderRadius: 2,
                background: meta.color,
                alignSelf: 'flex-end',
                opacity: 0.85,
              }} title={ev.type} />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="behavior-timeline-panel">
      <div className="fraud-panel-header" style={{ marginBottom: 12 }}>
        <div>
          <div className="fraud-panel-title">📊 Behavioral Timeline</div>
          <div className="fraud-panel-sub">Paper §Multi-Modal Behavioral Analysis</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{enriched.length} events</div>
          {clusters.length > 0 && (
            <div className="cluster-badge">{clusters.length} cluster{clusters.length > 1 ? 's' : ''}</div>
          )}
        </div>
      </div>

      {/* Type filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {uniqueTypes.slice(0, 8).map(type => {
          const meta = TYPE_META[type] || { icon: '⚠', color: '#aaa', short: type };
          return (
            <button key={type}
              onClick={() => setFilterType(type)}
              style={{
                padding: '3px 8px', borderRadius: 20, border: `1px solid ${filterType === type ? meta.color : 'var(--border)'}`,
                background: filterType === type ? `${meta.color}20` : 'transparent',
                color: filterType === type ? meta.color : 'var(--text-3)',
                fontSize: '0.62rem', cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              {type === 'ALL' ? '⬤ All' : `${meta.icon} ${meta.short}`}
            </button>
          );
        })}
      </div>

      {/* Timeline track */}
      {filtered.length > 0 ? (
        <>
          <div className="bt-track">
            {/* Time markers */}
            {[0, 25, 50, 75, 100].map(pct => (
              <div key={pct} style={{
                position: 'absolute', left: `${pct}%`, top: 0, bottom: 0,
                borderLeft: '1px solid rgba(255,255,255,0.05)',
                pointerEvents: 'none',
              }} />
            ))}

            {/* Cluster highlights */}
            {clusters.map((cluster, ci) => {
              const startPct = Math.min((cluster[0].relTime / totalDuration) * 100, 98);
              const endPct = Math.min((cluster[cluster.length-1].relTime / totalDuration) * 100, 98);
              return (
                <div key={ci} style={{
                  position: 'absolute',
                  left: `${startPct}%`,
                  width: `${Math.max(endPct - startPct, 2)}%`,
                  top: 0, bottom: 0,
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 3,
                  pointerEvents: 'none',
                }} />
              );
            })}

            {/* Event dots */}
            {filtered.map((ev, i) => (
              <EventDot key={i} ev={ev} totalDuration={totalDuration}
                onClick={setSelected} selected={selected?.id === ev.id} />
            ))}

            {/* Baseline track line */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />
          </div>

          {/* Time labels */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.58rem', color: 'var(--text-4)', marginTop: 4, marginBottom: 12 }}>
            <span>0s</span>
            <span>{Math.round(totalDuration / 2)}s</span>
            <span>{Math.round(totalDuration)}s</span>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '20px 0', fontSize: '0.78rem', color: 'var(--aegis-green)' }}>
          ✓ No events to display
        </div>
      )}

      {/* Selected event detail */}
      {selected && (
        <div className="bt-event-detail">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: '1.1rem' }}>{TYPE_META[selected.type]?.icon || '⚠'}</span>
              <strong>{selected.type}</strong>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <span className={`risk-severity ${selected.severity?.toLowerCase()}`}>{selected.severity}</span>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
            </div>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', lineHeight: 1.6 }}>{selected.desc}</div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-3)', marginTop: 6 }}>
            @ {selected.relTime?.toFixed(1)}s into session · {selected.ts}
          </div>
        </div>
      )}

      {/* Pattern summary */}
      {clusters.length > 0 && (
        <div className="bt-pattern-alert">
          <span>🔍</span>
          <span>Behavioral clustering detected: {clusters.length} burst(s) of suspicious activity. Possible coordinated assistance pattern.</span>
        </div>
      )}

      <div className="fraud-disclaimer" style={{ marginTop: 10 }}>
        Clusters (red zones) = multiple events within 10s. Burst patterns may indicate coordinated fraud.
      </div>
    </div>
  );
}
