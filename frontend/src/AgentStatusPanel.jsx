/**
 * AgentStatusPanel.jsx
 * Real-time display of all spoke agent statuses.
 * Shows in the Recruiter Command Center right panel.
 * Receives statuses from the Hub via WebSocket.
 */
import React from 'react';

const AGENT_META = {
  aria:         { icon: '🤖', label: 'Aria (Hub)',      color: 'var(--aegis-blue)'   },
  cv_agent:     { icon: '👁', label: 'CV Proctoring',   color: 'var(--aegis-cyan)'   },
  code_review:  { icon: '💻', label: 'Code Review',     color: 'var(--aegis-violet)' },
  bias_agent:   { icon: '⚖️', label: 'Bias Auditor',    color: 'var(--aegis-teal)'   },
  memory_agent: { icon: '🧠', label: 'Memory Agent',    color: 'var(--aegis-gold)'   },
};

const STATUS_STYLES = {
  idle:       { dot: 'rgba(255,255,255,0.2)',    label: 'Idle',       pulse: false },
  thinking:   { dot: 'var(--aegis-blue)',        label: 'Thinking…',  pulse: true  },
  generating: { dot: 'var(--aegis-cyan)',        label: 'Generating', pulse: true  },
  processing: { dot: 'var(--aegis-amber)',       label: 'Processing', pulse: true  },
  reviewing:  { dot: 'var(--aegis-violet)',      label: 'Reviewing',  pulse: true  },
  auditing:   { dot: 'var(--aegis-teal)',        label: 'Auditing',   pulse: true  },
  monitoring: { dot: 'var(--aegis-green)',       label: 'Monitoring', pulse: true  },
  ready:      { dot: 'var(--aegis-green)',       label: 'Ready',      pulse: false },
  error:      { dot: 'var(--aegis-red)',         label: 'Error',      pulse: false },
};

function AgentRow({ agentKey, status }) {
  const meta   = AGENT_META[agentKey] || { icon: '?', label: agentKey, color: 'var(--text-2)' };
  const style  = STATUS_STYLES[status] || STATUS_STYLES.idle;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 10px',
        borderRadius: 'var(--r-sm)',
        background: 'var(--card)',
        border: `1px solid ${status !== 'idle' ? meta.color + '33' : 'var(--border)'}`,
        transition: 'all 0.3s ease',
      }}
      role="status"
      aria-label={`${meta.label}: ${style.label}`}
    >
      {/* Agent icon */}
      <span style={{ fontSize: '1rem', flexShrink: 0, width: 20, textAlign: 'center' }}
            aria-hidden="true">{meta.icon}</span>

      {/* Agent label */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-1)' }}>
          {meta.label}
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-3)', letterSpacing: '0.5px' }}>
          {style.label}
        </div>
      </div>

      {/* Status dot */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: style.dot,
          flexShrink: 0,
          animation: style.pulse ? 'blink 1s ease-in-out infinite' : 'none',
          boxShadow: style.pulse ? `0 0 6px ${style.dot}` : 'none',
        }}
        aria-hidden="true"
      />
    </div>
  );
}

export default function AgentStatusPanel({ statuses = {} }) {
  const agentKeys = Object.keys(AGENT_META);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
      role="region"
      aria-label="Agent status panel"
    >
      <div style={{
        fontSize: '0.62rem', fontWeight: 700, letterSpacing: '2px',
        textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4,
      }}>
        ⚡ Agent Orchestra
      </div>

      {agentKeys.map(key => (
        <AgentRow key={key} agentKey={key} status={statuses[key] || 'idle'} />
      ))}

      {/* MCP Tools indicator */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px',
        borderRadius: 'var(--r-sm)',
        background: 'rgba(59,130,246,0.04)',
        border: '1px solid var(--border-blue)',
        marginTop: 4,
      }}>
        <div style={{ fontSize: '0.68rem', color: 'var(--aegis-blue)', fontWeight: 600 }}>
          🔌 MCP Layer
        </div>
        <div style={{ fontSize: '0.62rem', fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>
          sqlite + github
        </div>
      </div>

      {/* Memory tiers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 4, marginTop: 2,
      }}>
        {[
          { tier: 'T1', name: 'In-context', color: 'var(--aegis-blue)' },
          { tier: 'T2', name: 'Episodic',   color: 'var(--aegis-teal)' },
          { tier: 'T3', name: 'Vector',     color: 'var(--aegis-violet)' },
          { tier: 'T4', name: 'Procedural', color: 'var(--aegis-gold)' },
        ].map(m => (
          <div key={m.tier} style={{
            padding: '4px 8px',
            borderRadius: 'var(--r-sm)',
            background: 'var(--card)',
            border: `1px solid ${m.color}33`,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <div style={{ fontSize: '0.6rem', fontFamily: 'var(--mono)', color: m.color, fontWeight: 700 }}>
              {m.tier}
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-3)' }}>{m.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
