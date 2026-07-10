/**
 * ExtensionThreatCatalog.jsx — Recruiter-Facing Extension Threat Roster
 *
 * Shows every known cheating extension, browser tool, and external app:
 *  - Category (AI Assistant, Writing AI, Code AI, Screen Capture, Automation, etc.)
 *  - Why it's a threat (specific bypass mechanism)
 *  - How the nuclear lockdown detects and stops it
 *  - Current detection status (BLOCKED / DETECTED / NOT SEEN)
 *  - Detection vectors used
 *
 * This panel appears in the CommandCenter for recruiter forensic review.
 */
import React, { useState, useMemo } from 'react';
import { useAegisStore } from './useAegisStore';
import { EXTENSION_THREAT_CATALOG } from './useNuclearLockdown';

const CAT_CONFIG = {
  AI_ASSISTANT:      { label: 'AI Assistants',        icon: '🤖', color: 'var(--aegis-red)' },
  WRITING_AI:        { label: 'Writing AI',            icon: '✍️', color: 'var(--aegis-amber)' },
  CODE_AI:           { label: 'Code AI',               icon: '💻', color: '#ff6b35' },
  SCREEN_CAPTURE:    { label: 'Screen Capture',        icon: '📸', color: '#9b59b6' },
  TRANSLATOR:        { label: 'Translators',           icon: '🌐', color: '#4cc9f0' },
  VPN_PROXY:         { label: 'VPN/Proxy',             icon: '🔒', color: 'var(--aegis-cyan)' },
  AUTOMATION:        { label: 'Automation Scripts',    icon: '⚙️', color: 'var(--aegis-red)' },
  PASSWORD_MANAGER:  { label: 'Password Managers',     icon: '🔑', color: '#a8dadc' },
  ADBLOCKER:         { label: 'Ad Blockers',           icon: '🛡', color: '#6c757d' },
  MISC:              { label: 'Miscellaneous',         icon: '❓', color: '#495057' },
};

const SEV_CONFIG = {
  CRITICAL: { color: 'var(--aegis-red)', bg: 'rgba(239,68,68,0.1)',   label: '☠ CRITICAL' },
  HIGH:     { color: '#ff6b35', bg: 'rgba(255,107,53,0.1)',  label: '⛔ HIGH' },
  MEDIUM:   { color: 'var(--aegis-amber)', bg: 'rgba(245,158,11,0.1)',  label: '⚠ MEDIUM' },
  LOW:      { color: '#4cc9f0', bg: 'rgba(76,201,240,0.1)',  label: '● LOW' },
};

const DETECTION_METHODS = {
  selectors:    { label: 'DOM Scan',          icon: '🔍', vector: 1 },
  globals:      { label: 'API Surface',       icon: '🌐', vector: 2 },
  timingAttack: { label: 'Timing Attack',     icon: '⏱',  vector: 5 },
};

// ── Single Threat Row ─────────────────────────────────────────────────────────
function ThreatRow({ threat, isDetected }) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEV_CONFIG[threat.severity] || SEV_CONFIG.LOW;
  const cat = CAT_CONFIG[threat.cat] || CAT_CONFIG.MISC;

  const detectionVectors = [
    threat.selectors?.length > 0 && 'selectors',
    threat.globals?.length > 0   && 'globals',
    threat.timingAttack           && 'timingAttack',
  ].filter(Boolean);

  return (
    <div style={{
      marginBottom: 4,
      border: `1px solid ${isDetected ? `${sev.color}50` : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 8,
      background: isDetected ? sev.bg : 'rgba(255,255,255,0.02)',
      overflow: 'hidden',
      transition: 'all 0.2s',
    }}>
      {/* Row header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', cursor: 'pointer',
        }}
      >
        {/* Category icon */}
        <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>{cat.icon}</span>

        {/* Name + cat */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isDetected ? sev.color : 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {threat.name}
          </div>
          <div style={{ fontSize: '0.58rem', color: 'var(--text-3)' }}>
            {cat.label}
          </div>
        </div>

        {/* Detection vectors */}
        <div style={{ display: 'flex', gap: 3 }}>
          {detectionVectors.map(v => (
            <span key={v} title={DETECTION_METHODS[v].label} style={{
              fontSize: '0.7rem',
              background: 'rgba(59,130,246,0.1)',
              border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 4, padding: '1px 4px',
            }}>
              {DETECTION_METHODS[v].icon}
            </span>
          ))}
          {threat.timingAttack && (
            <span title="Network Timing Attack" style={{ fontSize: '0.7rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 4, padding: '1px 4px' }}>⏱</span>
          )}
        </div>

        {/* Severity badge */}
        <div style={{
          fontSize: '0.58rem', fontWeight: 800, padding: '2px 7px',
          borderRadius: 99, flexShrink: 0,
          color: sev.color, background: sev.bg,
        }}>
          {sev.label}
        </div>

        {/* Status */}
        <div style={{
          fontSize: '0.6rem', fontWeight: 800, padding: '2px 8px',
          borderRadius: 99, flexShrink: 0, minWidth: 72, textAlign: 'center',
          color: isDetected ? 'var(--aegis-red)' : 'var(--aegis-green)',
          background: isDetected ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.08)',
        }}>
          {isDetected ? '⛔ DETECTED' : '✓ NOT SEEN'}
        </div>

        {/* Expand arrow */}
        <span style={{ color: 'var(--text-3)', fontSize: '0.7rem', transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'none' }}>›</span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{
          padding: '10px 12px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          background: 'rgba(0,0,0,0.2)',
        }}>
          {/* Why it's dangerous */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: '#ff6b35', marginBottom: 3 }}>
              ⚠ BYPASS MECHANISM
            </div>
            <div style={{ fontSize: '0.67rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
              {threat.why}
            </div>
          </div>

          {/* Detection method */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--aegis-blue)', marginBottom: 3 }}>
              🛡 HOW AEGIS DETECTS IT
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
              {detectionVectors.map(v => DETECTION_METHODS[v]).map((m, i) => (
                <span key={i} style={{ marginRight: 8 }}>
                  {m.icon} <strong>Vector {m.vector}</strong>: {m.label}
                </span>
              ))}
              {threat.timingAttack && <span>⏱ <strong>Vector 5</strong>: Resource timing attack (block &lt;10ms)</span>}
            </div>
          </div>

          {/* Selectors (technical) */}
          {threat.selectors?.length > 0 && (
            <div>
              <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 3 }}>
                DOM FINGERPRINTS
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {threat.selectors.map(s => (
                  <code key={s} style={{
                    fontSize: '0.58rem', padding: '1px 5px',
                    background: 'rgba(59,130,246,0.08)',
                    border: '1px solid rgba(59,130,246,0.2)',
                    borderRadius: 4, color: 'var(--aegis-cyan)',
                  }}>{s}</code>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export default function ExtensionThreatCatalog() {
  const { riskEvents, detectedExtensions } = useAegisStore();
  const [filterCat,  setFilterCat]  = useState('ALL');
  const [filterSev,  setFilterSev]  = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Build a set of detected extension IDs from risk events
  const detectedSet = useMemo(() => {
    const ids = new Set();
    (riskEvents || []).forEach(ev => {
      if (ev.type === 'EXTENSION_DETECTED' || ev.type === 'EXTENSION_GLOBAL') {
        // Try to match by name in description
        EXTENSION_THREAT_CATALOG.forEach(t => {
          if (ev.desc?.toLowerCase().includes(t.name.toLowerCase())) {
            ids.add(t.id);
          }
        });
      }
    });
    // Also check detectedExtensions store
    (detectedExtensions || []).forEach(d => {
      EXTENSION_THREAT_CATALOG.forEach(t => {
        if (d.desc?.toLowerCase().includes(t.name.toLowerCase())) ids.add(t.id);
      });
    });
    return ids;
  }, [riskEvents, detectedExtensions]);

  const categories = ['ALL', ...Object.keys(CAT_CONFIG)];
  const severities  = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

  const filtered = useMemo(() => EXTENSION_THREAT_CATALOG.filter(t => {
    const matchCat  = filterCat  === 'ALL' || t.cat      === filterCat;
    const matchSev  = filterSev  === 'ALL' || t.severity === filterSev;
    const matchSearch = !searchTerm || t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.why.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCat && matchSev && matchSearch;
  }), [filterCat, filterSev, searchTerm]);

  const detectedCount  = EXTENSION_THREAT_CATALOG.filter(t => detectedSet.has(t.id)).length;
  const criticalCount  = EXTENSION_THREAT_CATALOG.filter(t => t.severity === 'CRITICAL').length;

  return (
    <div style={{
      background: 'rgba(8,12,24,0.98)',
      border: '1px solid rgba(239,68,68,0.2)',
      borderRadius: 14,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        background: 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(10,14,28,0))',
        borderBottom: '1px solid rgba(239,68,68,0.15)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--aegis-red)', marginBottom: 4 }}>
              ⛔ EXTENSION THREAT CATALOG
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 900, color: '#fff', marginBottom: 4 }}>
              {EXTENSION_THREAT_CATALOG.length} Known Cheating Vectors
            </div>
            <div style={{ fontSize: '0.67rem', color: 'var(--text-3)', lineHeight: 1.5 }}>
              Every browser extension, app, and tool that can assist cheating — how it bypasses basic security and how Aegis v4.2 blocks it.
            </div>
          </div>
          {/* Stats */}
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <div style={{ textAlign: 'center', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10 }}>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 900, fontSize: '1.3rem', color: 'var(--aegis-red)' }}>{detectedCount}</div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-3)' }}>DETECTED</div>
            </div>
            <div style={{ textAlign: 'center', padding: '8px 12px', background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.25)', borderRadius: 10 }}>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 900, fontSize: '1.3rem', color: '#ff6b35' }}>{criticalCount}</div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-3)' }}>CRITICAL</div>
            </div>
            <div style={{ textAlign: 'center', padding: '8px 12px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10 }}>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 900, fontSize: '1.3rem', color: 'var(--aegis-green)' }}>10</div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-3)' }}>VECTORS</div>
            </div>
          </div>
        </div>

        {/* Detection vector legend */}
        <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.12)', borderRadius: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            { icon: '🔍', label: 'V1: DOM Scan' },
            { icon: '🌐', label: 'V2: API Surface' },
            { icon: '🛡', label: 'V3: Network' },
            { icon: '⚡', label: 'V4: isTrusted' },
            { icon: '⏱', label: 'V5: Timing' },
            { icon: '🎨', label: 'V6: CSS Inject' },
            { icon: '💾', label: 'V7: Storage' },
            { icon: '📦', label: 'V8: iframe/Worker' },
            { icon: '🖥', label: 'V9: Fullscreen' },
            { icon: '🤖', label: 'V10: Synthetic' },
          ].map(v => (
            <span key={v.label} style={{ fontSize: '0.6rem', color: 'var(--text-3)' }}>
              {v.icon} {v.label}
            </span>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <input
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search extension or threat…"
          style={{
            flex: 1, minWidth: 160,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 7, padding: '5px 10px', color: 'var(--text-1)',
            fontSize: '0.68rem', fontFamily: 'var(--font)',
          }}
        />
        {/* Category filter */}
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 7, padding: '5px 8px', color: 'var(--text-2)',
          fontSize: '0.65rem', fontFamily: 'var(--font)',
        }}>
          {categories.map(c => <option key={c} value={c}>{c === 'ALL' ? 'All Categories' : CAT_CONFIG[c]?.label}</option>)}
        </select>
        {/* Severity filter */}
        <select value={filterSev} onChange={e => setFilterSev(e.target.value)} style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 7, padding: '5px 8px', color: 'var(--text-2)',
          fontSize: '0.65rem', fontFamily: 'var(--font)',
        }}>
          {severities.map(s => <option key={s} value={s}>{s === 'ALL' ? 'All Severities' : s}</option>)}
        </select>
        <span style={{ fontSize: '0.62rem', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
          {filtered.length}/{EXTENSION_THREAT_CATALOG.length} shown
        </span>
      </div>

      {/* Threat list */}
      <div style={{ padding: '10px 14px', maxHeight: 480, overflowY: 'auto' }}>
        {/* Detected threats first */}
        {detectedCount > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--aegis-red)', marginBottom: 6 }}>
              ⛔ DETECTED IN THIS SESSION ({detectedCount})
            </div>
            {filtered.filter(t => detectedSet.has(t.id)).map(t => (
              <ThreatRow key={t.id} threat={t} isDetected={true} isBlocked={true} />
            ))}
          </div>
        )}

        {/* Not-detected threats */}
        <div>
          {detectedCount > 0 && (
            <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>
              ✓ NOT DETECTED ({filtered.filter(t => !detectedSet.has(t.id)).length})
            </div>
          )}
          {filtered.filter(t => !detectedSet.has(t.id)).map(t => (
            <ThreatRow key={t.id} threat={t} isDetected={false} isBlocked={false} />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 14px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        fontSize: '0.58rem', color: 'var(--text-3)', lineHeight: 1.5,
        background: 'rgba(0,0,0,0.3)',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>🔬 Aegis v4.2 — Nuclear Security Layer. Catalog updates with each session.</span>
        <span style={{ color: 'var(--aegis-green)' }}>Zero-bypass architecture. Auto-penalty on detection.</span>
      </div>
    </div>
  );
}
