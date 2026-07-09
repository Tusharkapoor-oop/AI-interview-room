/**
 * TransparencyNotice.jsx — Phase 5.4
 *
 * EU AI Act Art. 5(1)(f) safety exception disclosure, GDPR Art. 13-14 transparency,
 * NYC Local Law 144 automated decision-making notice.
 *
 * Displays to candidates before the interview starts:
 *   - What AI monitoring is active and why (security only, not evaluation)
 *   - Data collected and retention period (30/90 day purge)
 *   - Right to appeal automated decisions
 *   - EU AI Act high-risk system classification and safety exceptions
 */
import React, { useState } from 'react';

const SECTIONS = [
  {
    id: 'monitoring',
    title: 'AI Monitoring Scope',
    icon: '📡',
    content: (
      <div>
        <p>This interview uses AI-powered integrity monitoring <strong>solely for security and anti-fraud purposes</strong> (EU AI Act Art. 5(1)(f) safety exception).</p>
        <ul style={{ marginTop: 12, paddingLeft: 20, lineHeight: 2 }}>
          <li><strong>Gaze tracking:</strong> Detects screen reading patterns (potential unauthorized assistance)</li>
          <li><strong>Face presence:</strong> Verifies continuous physical presence (anti-deepfake)</li>
          <li><strong>Pupil response:</strong> PLR challenge-response (liveness verification)</li>
          <li><strong>Heart rate (rPPG):</strong> Detects synthetic video injection (ChatPPG-style attacks)</li>
          <li><strong>Audio analysis:</strong> Speaker verification + transcription for integrity only</li>
        </ul>
        <p style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(167,139,250,0.08)', borderRadius: 8, fontSize: '0.78rem' }}>
          <strong>🔒 NOT used for:</strong> Candidate evaluation, hiring decisions, personality assessment, emotion analysis for employment purposes. All biometric data is processed in real-time and <strong>never leaves your device</strong> in raw form.
        </p>
      </div>
    ),
  },
  {
    id: 'data',
    title: 'Data Retention & Deletion',
    icon: '🗑️',
    content: (
      <div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', marginTop: 8 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>Data Type</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>Retention</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>Processing</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <td style={{ padding: '6px 8px' }}>Anonymized telemetry (gaze, pose, metrics)</td>
              <td style={{ padding: '6px 8px' }}>90 days</td>
              <td style={{ padding: '6px 8px' }}>Auto-purged</td>
            </tr>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <td style={{ padding: '6px 8px' }}>Integrity score + risk events</td>
              <td style={{ padding: '6px 8px' }}>2 years (legal hold)</td>
              <td style={{ padding: '6px 8px' }}>Encrypted at rest</td>
            </tr>
            <tr>
              <td style={{ padding: '6px 8px' }}>Raw video frames (transient)</td>
              <td style={{ padding: '6px 8px' }}>Never stored server-side</td>
              <td style={{ padding: '6px 8px' }}>Processed in-memory only</td>
            </tr>
          </tbody>
        </table>
        <p style={{ marginTop: 12, fontSize: '0.75rem', color: 'var(--text-3)' }}>
          You may request early deletion of your data at any time by emailing privacy@aegis-platform.com.
        </p>
      </div>
    ),
  },
  {
    id: 'appeal',
    title: 'Right to Appeal',
    icon: '⚖️',
    content: (
      <div>
        <p>Under the EU AI Act (Art. 14, Art. 22) and NYC Local Law 144, you have the right to:</p>
        <ul style={{ marginTop: 12, paddingLeft: 20, lineHeight: 2 }}>
          <li><strong>Human review</strong> of any automated integrity flag that affects your interview</li>
          <li><strong>Explanation</strong> of how integrity scores are calculated</li>
          <li><strong>Correction</strong> of incorrect data used in automated decisions</li>
          <li><strong>Appeal</strong> any adverse decision based on automated processing</li>
        </ul>
        <p style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(74,222,128,0.08)', borderRadius: 8, fontSize: '0.78rem' }}>
          ✅ Every integrity flag below our threshold is automatically escalated for human-in-the-loop review — you will never be rejected solely by an AI.
        </p>
      </div>
    ),
  },
];

export default function TransparencyNotice({ onAcknowledge }) {
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  const [acknowledged, setAcknowledged] = useState(false);

  const handleAcknowledge = () => {
    setAcknowledged(true);
    onAcknowledge?.();
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100%', padding: '32px 24px', background: 'var(--void)', boxSizing: 'border-box',
    }}>
      <div style={{ width: '100%', maxWidth: 700 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 16px',
            background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)',
            borderRadius: 99, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--aegis-violet)', marginBottom: 16,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--aegis-violet)', display: 'inline-block' }} />
            EU AI Act Compliance · Transparency Notice
          </div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-1)', marginBottom: 8 }}>
            AI Monitoring Disclosure
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-2)', lineHeight: 1.65 }}>
            This platform uses automated integrity monitoring for <strong>security purposes only</strong>.
            Please review what data is collected, how it is used, and your rights.
          </p>
        </div>

        {/* Section Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, justifyContent: 'center' }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              border: `1px solid ${activeSection === s.id ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 99, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
              background: activeSection === s.id ? 'rgba(167,139,250,0.12)' : 'transparent',
              color: activeSection === s.id ? 'var(--aegis-violet)' : 'var(--text-3)',
              transition: 'all 0.2s',
            }}>
              <span>{s.icon}</span>
              {s.title}
            </button>
          ))}
        </div>

        {/* Active Section Content */}
        <div style={{
          background: 'rgba(13,13,26,0.9)', border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: 16, padding: '24px 28px', marginBottom: 24,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
        }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: 12 }}>
            {SECTIONS.find(s => s.id === activeSection)?.icon}{' '}
            {SECTIONS.find(s => s.id === activeSection)?.title}
          </h3>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-2)', lineHeight: 1.75 }}>
            {SECTIONS.find(s => s.id === activeSection)?.content}
          </div>
        </div>

        {/* Acknowledge */}
        <div style={{
          textAlign: 'center', padding: '20px 24px',
          background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.12)',
          borderRadius: 12,
        }}>
          {!acknowledged ? (
            <>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginBottom: 14, lineHeight: 1.6 }}>
                By proceeding, you acknowledge the integrity monitoring described above is active during this interview.
                You may withdraw consent at any time, which will end the session.
              </p>
              <button className="btn-premium success" style={{ fontSize: '0.85rem', padding: '12px 32px' }} onClick={handleAcknowledge}>
                I Understand & Proceed →
              </button>
            </>
          ) : (
            <div style={{ fontSize: '0.85rem', color: 'var(--aegis-green)', fontWeight: 700 }}>
              ✅ Acknowledged — proceeding to interview
            </div>
          )}
        </div>

        {/* Legal footer */}
        <div style={{
          marginTop: 20, fontSize: '0.6rem', color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.6,
        }}>
          Compliance: EU AI Act (Regulation 2024/1689) Art. 5, 14, 27, 50 · GDPR Art. 5, 13, 14, 22 ·
          NYC Local Law 144 · Illinois BIPA (740 ILCS 14) · California CCPA (Cal. Civ. Code §1798.100)
        </div>
      </div>
    </div>
  );
}
