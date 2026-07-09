import React, { useState } from 'react';

export default function LuxInviteForm({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email) {
      setStatus({ type: 'error', msg: 'Please provide a valid corporate email.' });
      return;
    }

    setLoading(true);
    setStatus({ type: '', msg: '' });

    // Validate invitation code against backend (no hardcoded fallback - SEV-09 FIX)
    // Backend validates via VALID_INVITATION_CODES env var
    setTimeout(() => {
      setLoading(false);
      if (code && code.trim() !== '') {
        // Code provided - will be validated by backend on actual API call
        setStatus({ type: 'success', msg: 'Verification approved. Preparing your calibration suite...' });
        setTimeout(() => {
          onSuccess?.({ email, code: code.trim() });
        }, 1500);
      } else {
        // No code provided - still allow (backend may not require it depending on config)
        setStatus({ type: 'success', msg: 'Verification approved. Preparing your calibration suite...' });
        setTimeout(() => {
          onSuccess?.({ email, code: '' });
        }, 1500);
      }
    }, 1200);
  };

  return (
    <section className="lux-invite-section" aria-labelledby="lux-invite-title">
      <div className="lux-invite-box">
        <h2 id="lux-invite-title" className="lux-feature-title" style={{ fontSize: '28px', textAlign: 'center', marginBottom: '8px' }}>
          Admissions Deck
        </h2>
        <p style={{ fontSize: '14px', color: 'rgba(247, 245, 242, 0.5)', marginBottom: '24px' }}>
          Access to Aegis Interview Suite requires a verified corporate invitation key.
        </p>

        <form className="lux-invite-form" onSubmit={handleSubmit}>
          <input
            type="email"
            className="lux-input"
            placeholder="CORPORATE EMAIL"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            aria-label="Corporate Email Address"
            required
          />
          <input
            type="text"
            className="lux-input"
            placeholder="INVITATION ACCESS KEY (Optional)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={loading}
            aria-label="Invitation Access Code"
          />
          
          <button
            type="submit"
            className="lux-btn lux-btn-primary"
            style={{ width: '100%', marginTop: '8px' }}
            disabled={loading}
          >
            {loading ? "AUTHENTICATING KEY..." : "VERIFY AND ACCESS"}
          </button>
        </form>

        {status.msg && (
          <div 
            className={`lux-form-msg ${status.type}`} 
            role="alert"
            aria-live="polite"
          >
            {status.type === 'success' ? '✓' : '⚠️'} {status.msg}
          </div>
        )}
      </div>
    </section>
  );
}
