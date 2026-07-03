import React, { useState, useEffect } from 'react';

export default function LuxConciergeHero({ onBegin, onExplore, onDirectEnter, onSecurityDash }) {
  const [typedText, setTypedText] = useState('');
  const fullSubhead = 'An elite, non-disruptive AI proctoring sanctuary powered by edge WebGPU biometrics.';

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i <= fullSubhead.length) {
        setTypedText(fullSubhead.slice(0, i));
        i++;
      } else {
        clearInterval(interval);
      }
    }, 35);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="lux-hero" aria-labelledby="hero-heading">
      <div className="lux-hero-particles" aria-hidden="true" />
      
      <div className="lux-hero-content">
        <span className="lux-hero-badge">Sovereign Archonate Grade · v5.0</span>
        
        <h1 id="hero-heading" className="lux-heading-serif" style={{ marginBottom: '24px' }}>
          Where Absolute Security<br />
          <span style={{ color: 'var(--lux-champagne)', fontStyle: 'italic' }}>Meets Cinematic Exclusivity</span>
        </h1>

        <p className="lux-body-sans" style={{ minHeight: '60px', maxWidth: '680px', margin: '0 auto 40px auto' }}>
          {typedText}
          <span style={{ borderRight: '2px solid var(--lux-champagne)', marginLeft: '4px' }} />
        </p>

        <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button 
            className="lux-btn-primary" 
            onClick={onBegin}
            aria-label="Begin your interview journey and open concierge"
          >
            Begin Onboarding Tour ✨
          </button>
          <button 
            className="lux-btn-primary" 
            onClick={onDirectEnter}
            aria-label="Launch Live Interview Room Directly"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: '1px solid #fbbf24', boxShadow: '0 0 15px rgba(245, 158, 11, 0.4)' }}
          >
            ⚡ Enter Live Interview Room →
          </button>
          <button 
            className="lux-btn-ghost" 
            onClick={onSecurityDash}
            aria-label="View Security Forensics Dashboard"
            style={{ borderColor: 'rgba(239,68,68,0.5)', color: '#f87171' }}
          >
            🛡️ Security Intel Dashboard
          </button>
          <button 
            className="lux-btn-ghost" 
            onClick={onExplore}
            aria-label="Explore platform features"
          >
            Explore Specs ↓
          </button>
        </div>
      </div>

      {/* Abstract Architectural Visual Fallback */}
      <div style={{
        marginTop: '64px',
        width: '100%',
        maxWidth: '1000px',
        height: '320px',
        borderRadius: '24px',
        border: '1px solid rgba(201, 167, 107, 0.25)',
        background: 'linear-gradient(180deg, rgba(18, 18, 20, 0.8) 0%, rgba(11, 11, 13, 0.95) 100%)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.15, background: 'radial-gradient(circle at 50% 50%, #C9A76B, transparent 70%)' }} />
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🛡️</div>
        <div className="lux-ui-sans" style={{ color: 'var(--lux-champagne)' }}>
          Fail-Closed Wasm Engine & Dual-Modal PLR Telemetry
        </div>
        <div style={{ color: 'rgba(247, 245, 242, 0.5)', fontSize: '13px', marginTop: '8px' }}>
          Client-Side Sandbox · Zero Network Video Leakage · ISO/IEC 30107-3 Verified
        </div>
      </div>
    </section>
  );
}
