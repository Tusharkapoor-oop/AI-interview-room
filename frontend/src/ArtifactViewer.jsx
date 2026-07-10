/**
 * ArtifactViewer.jsx
 * Browse and download all agent artifacts for a session.
 * Shows: SESSION_PLAN, RISK_REPORT, CODE_REVIEW, BIAS_AUDIT_LOG, INTEGRITY_REPORT, MEMORY_SUMMARY
 * Each artifact can be expanded inline or downloaded as JSON.
 */
import React, { useEffect, useState } from 'react';

const TYPE_META = {
  SESSION_PLAN:     { icon: '📋', color: 'var(--aegis-blue)',   agent: 'Hub (Aria)'     },
  RISK_REPORT:      { icon: '🛡️', color: 'var(--aegis-red)',    agent: 'CVAgent'        },
  CODE_REVIEW:      { icon: '💻', color: 'var(--aegis-violet)', agent: 'CodeReviewAgent'},
  BIAS_AUDIT_LOG:   { icon: '⚖️', color: 'var(--aegis-teal)',   agent: 'BiasAuditAgent' },
  INTEGRITY_REPORT: { icon: '📊', color: 'var(--aegis-cyan)',   agent: 'Hub'            },
  MEMORY_SUMMARY:   { icon: '🧠', color: 'var(--aegis-gold)',   agent: 'MemoryAgent'    },
};

function ArtifactCard({ artifact }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TYPE_META[artifact.type] || { icon: '📄', color: 'var(--text-2)', agent: artifact.agent };

  const download = () => {
    const blob = new Blob([JSON.stringify(artifact.content, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${artifact.type.toLowerCase()}_${artifact.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      background: 'var(--card)',
      border: `1px solid ${expanded ? meta.color + '40' : 'var(--border)'}`,
      borderRadius: 'var(--r-md)',
      overflow: 'hidden',
      transition: 'border-color 0.2s ease',
    }}>
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setExpanded(!expanded)}
        role="button"
        aria-expanded={expanded}
        aria-label={`${artifact.type} artifact — click to expand`}
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setExpanded(!expanded)}
      >
        <span style={{ fontSize: '1rem', flexShrink: 0 }} aria-hidden="true">{meta.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)' }}>
            {artifact.type.replace(/_/g, ' ')}
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-3)', letterSpacing: '0.5px' }}>
            by {meta.agent} · {artifact.created_at?.slice(11, 19) || '—'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {artifact.content && (
            <button
              onClick={e => { e.stopPropagation(); download(); }}
              style={{
                background: 'none', border: 'none',
                color: 'var(--text-3)', cursor: 'pointer',
                fontSize: '0.7rem', fontWeight: 600, letterSpacing: '1px',
                padding: '3px 8px',
                borderRadius: 'var(--r-sm)',
                transition: 'color 0.15s',
              }}
              aria-label={`Download ${artifact.type} artifact`}
            >↓ JSON</button>
          )}
          <span style={{ color: 'var(--text-3)', fontSize: '0.8rem', transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'none' }}>›</span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && artifact.content && (
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '12px 14px',
          background: 'rgba(0,0,0,0.3)',
          overflow: 'auto',
          maxHeight: 300,
        }}>
          <pre style={{
            fontFamily: 'var(--mono)',
            fontSize: '0.72rem',
            color: 'var(--text-2)',
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {JSON.stringify(artifact.content, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function ArtifactViewer({ sessionId }) {
  const [artifacts, setArtifacts] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(`/api/v1/artifacts/${sessionId}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!cancelled) setArtifacts(data.artifacts || []);
      } catch {
        if (!cancelled) setError('Backend not connected — artifacts unavailable.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      role="region"
      aria-label="Session artifacts"
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 4,
      }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--text-3)' }}>
          📦 Agent Artifacts
        </div>
        <button
          onClick={() => { window.location.reload(); }}
          style={{
            background: 'none', border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)', padding: '3px 8px',
            color: 'var(--text-3)', cursor: 'pointer', fontSize: '0.68rem',
          }}
          aria-label="Refresh artifacts"
        >⟳ Refresh</button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '0.8rem', padding: 16 }}>
          Loading artifacts…
        </div>
      )}

      {error && (
        <div style={{
          padding: '8px 12px', fontSize: '0.75rem', color: 'var(--aegis-amber)',
          background: 'rgba(255,159,28,0.06)', border: '1px solid rgba(255,159,28,0.2)',
          borderRadius: 'var(--r-sm)',
        }}>
          {error}
        </div>
      )}

      {!loading && !error && artifacts.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '0.78rem', padding: '12px 0' }}>
          No artifacts yet — start an interview session.
        </div>
      )}

      {artifacts.map(a => <ArtifactCard key={a.id} artifact={a} />)}
    </div>
  );
}
