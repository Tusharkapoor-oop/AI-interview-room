/**
 * AppealPanel.jsx — Layer 7: Human Oversight — Appeal System
 * 
 * Paper §8 Layer 7:
 *   - Candidate-facing appeal submission
 *   - False-positive acknowledgment flow
 *   - Context submission with flag details
 *   - Recruiter decision audit trail entry
 */
import React, { useState } from 'react';
import { useAegisStore } from './useAegisStore';

const FLAG_CATEGORIES = [
  { id: 'gaze',     label: 'Eye Movement Flag',       reason: 'I was thinking / looking away naturally' },
  { id: 'tab',      label: 'Tab Switch Flag',          reason: 'Accidental switch / OS notification' },
  { id: 'paste',    label: 'Paste / Typing Flag',      reason: 'I typed normally / pasted my own notes' },
  { id: 'face',     label: 'Face Match Issue',         reason: 'Lighting changed / I adjusted my position' },
  { id: 'device',   label: 'Device / Camera Flag',     reason: 'My webcam shows incorrectly branded' },
  { id: 'voice',    label: 'Voice / Audio Flag',       reason: 'Background noise from environment' },
  { id: 'a11y',     label: 'Accessibility Condition',  reason: 'I have a medical / neurological condition' },
  { id: 'other',    label: 'Other Reason',             reason: '' },
];

const ACCESSIBILITY_CONDITIONS = [
  'Eye movement disorder (nystagmus, strabismus)',
  'ADHD / attention deficit',
  'Autism spectrum',
  'Tourette syndrome',
  'Post-stroke motor effects',
  'Speech impediment',
  'Hearing impairment requiring lip-reading',
  'Other medical condition',
];

export default function AppealPanel({ flagType, onClose }) {
  const { riskEvents, integrityScore, candidateName, addRiskEvent } = useAegisStore();

  const [step,        setStep]        = useState(0); // 0=reason, 1=details, 2=confirm, 3=submitted
  const [category,    setCategory]    = useState(null);
  const [details,     setDetails]     = useState('');
  const [a11y,        setA11y]        = useState('');
  const [useA11y,     setUseA11y]     = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [refId] = useState(() => `APL-${Date.now().toString(36).toUpperCase()}`);

  const handleSubmit = async () => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1400));

    // Log the appeal as a special event so recruiters can see it
    addRiskEvent({
      type:     'CANDIDATE_APPEAL',
      severity: 'LOW',
      desc:     `Candidate submitted appeal — Category: "${category?.label}" · Details: "${details.slice(0, 100)}"${useA11y ? ` · Accessibility: "${a11y}"` : ''}`,
    });

    setSubmitting(false);
    setStep(3);
  };

  const relevantFlags = riskEvents.filter(ev =>
    !flagType || ev.type === flagType
  ).slice(-5);

  return (
    <div className="appeal-overlay">
      <div className="appeal-card">
        {/* Header */}
        <div className="appeal-header">
          <div>
            <div className="appeal-title">⚖ Submit an Appeal</div>
            <div className="appeal-sub">Layer 7 — Human Oversight · All appeals reviewed by a human</div>
          </div>
          <button className="appeal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Progress dots */}
        {step < 3 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {['Select Reason', 'Add Details', 'Confirm'].map((s, i) => (
              <div key={s} style={{ flex: 1, padding: '5px 0', textAlign: 'center', fontSize: '0.62rem', fontWeight: 700, borderBottom: `2px solid ${i <= step ? 'var(--aegis-blue)' : 'var(--border)'}`, color: i <= step ? 'var(--aegis-blue)' : 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {s}
              </div>
            ))}
          </div>
        )}

        {/* Step 0: Select reason category */}
        {step === 0 && (
          <div>
            <div className="appeal-step-label">What best describes why this flag may be incorrect?</div>
            <div className="appeal-categories">
              {FLAG_CATEGORIES.map(cat => (
                <button key={cat.id}
                  className={`appeal-category ${category?.id === cat.id ? 'selected' : ''}`}
                  onClick={() => setCategory(cat)}
                >
                  {cat.label}
                  {cat.id === 'a11y' && <span className="a11y-badge">♿</span>}
                </button>
              ))}
            </div>
            {category?.id === 'a11y' && (
              <div style={{ marginTop: 12 }}>
                <div className="config-label">Select your condition (optional):</div>
                <select
                  className="config-input"
                  value={a11y}
                  onChange={e => setA11y(e.target.value)}
                >
                  <option value="">Prefer not to say</option>
                  {ACCESSIBILITY_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            {/* Show relevant flags */}
            {relevantFlags.length > 0 && (
              <div className="appeal-flags">
                <div className="config-label" style={{ marginBottom: 8 }}>Flags being appealed:</div>
                {relevantFlags.map(ev => (
                  <div key={ev.id} className={`appeal-flag-item ${ev.severity}`}>
                    <span className={`risk-severity ${ev.severity}`}>{ev.severity}</span>
                    <span>{ev.desc || ev.type}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: 'var(--text-3)', flexShrink: 0 }}>{ev.ts}</span>
                  </div>
                ))}
              </div>
            )}
            <button className="btn-primary" style={{ marginTop: 16 }} disabled={!category} onClick={() => setStep(1)}>
              Continue →
            </button>
          </div>
        )}

        {/* Step 1: Add details */}
        {step === 1 && (
          <div>
            <div className="appeal-step-label">Provide additional context to help the reviewer.</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginBottom: 8 }}>
              Suggested: "{category?.reason}"
            </div>
            <textarea
              className="config-input"
              style={{ resize: 'vertical', minHeight: 100, fontFamily: 'var(--font)' }}
              placeholder="Describe why this flag is incorrect (max 500 characters)"
              value={details}
              onChange={e => setDetails(e.target.value.slice(0, 500))}
            />
            <div style={{ fontSize: '0.65rem', color: 'var(--text-3)', textAlign: 'right', marginTop: 4 }}>{details.length}/500</div>

            {/* Accessibility context checkbox */}
            {category?.id !== 'a11y' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: 'var(--text-2)', marginTop: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={useA11y} onChange={e => setUseA11y(e.target.checked)} />
                I also want to declare an accessibility accommodation ♿
              </label>
            )}
            {useA11y && (
              <select className="config-input" style={{ marginTop: 8 }} value={a11y} onChange={e => setA11y(e.target.value)}>
                <option value="">Select condition…</option>
                {ACCESSIBILITY_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.78rem' }} onClick={() => setStep(0)}>← Back</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={() => setStep(2)}>Review & Submit →</button>
            </div>
          </div>
        )}

        {/* Step 2: Confirm */}
        {step === 2 && (
          <div>
            <div className="appeal-step-label">Review your appeal before submitting.</div>
            <div className="appeal-review-box">
              <div className="appeal-review-row"><span>Category:</span><strong>{category?.label}</strong></div>
              {details && <div className="appeal-review-row"><span>Details:</span><span style={{ color: 'var(--text-2)', fontSize: '0.8rem' }}>{details}</span></div>}
              {(useA11y || category?.id === 'a11y') && a11y && <div className="appeal-review-row"><span>Accessibility:</span><strong>♿ {a11y}</strong></div>}
              <div className="appeal-review-row"><span>Candidate:</span><strong>{candidateName}</strong></div>
              <div className="appeal-review-row"><span>Integrity Score:</span><strong style={{ color: integrityScore >= 80 ? 'var(--aegis-green)' : 'var(--aegis-amber)' }}>{integrityScore}%</strong></div>
            </div>

            <div className="appeal-rights-notice">
              By submitting, you confirm that your statements are truthful. Your appeal will be reviewed by a qualified human reviewer within 24 hours. You will be notified of the outcome.
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.78rem' }} onClick={() => setStep(1)}>← Back</button>
              <button className="btn-premium success" style={{ flex: 1 }} disabled={submitting} onClick={handleSubmit}>
                {submitting ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                    <span className="check-spinner" /> Submitting…
                  </span>
                ) : '✓ Submit Appeal'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Submitted */}
        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 8 }}>Appeal Submitted</div>
            <div style={{ color: 'var(--text-2)', fontSize: '0.84rem', lineHeight: 1.6, marginBottom: 20 }}>
              A human reviewer will examine your case. No decision has been made. You may continue your interview session. Response within 24 hours.
            </div>
            <div className="appeal-ref">
              Reference: <strong>{refId}</strong>
            </div>
            <button className="btn-premium" style={{ marginTop: 20 }} onClick={onClose}>
              Return to Interview
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
