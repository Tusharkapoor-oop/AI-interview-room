import React, { useState } from 'react';
import './LuxConciergeBundle.css';
import LuxConciergeHero from './LuxConciergeHero';
import LuxConciergePopup from './LuxConciergePopup';

export default function LuxConciergeApp({ onComplete, onDirectEnter, onSecurityDash, initialReducedMotion = false }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(initialReducedMotion);

  const handleExplore = () => {
    document.getElementById('lux-explore-grid')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className={`lux-container ${reducedMotion ? 'lux-reduced-motion' : ''}`}>
      {/* Motion & Feature Flag Toggle */}
      <div style={{ position: 'fixed', top: '16px', right: '16px', zIndex: 1000, display: 'flex', gap: '8px' }}>
        <button
          onClick={() => setReducedMotion(prev => !prev)}
          className="lux-btn-ghost"
          style={{ padding: '6px 14px', fontSize: '11px', background: 'rgba(11, 11, 13, 0.8)' }}
        >
          {reducedMotion ? "Motion: Off" : "Motion: High"}
        </button>
      </div>

      {/* Hero */}
      <LuxConciergeHero onBegin={() => setModalOpen(true)} onExplore={handleExplore} onDirectEnter={onDirectEnter} onSecurityDash={onSecurityDash} />

      {/* Feature Grid Section */}
      <section id="lux-explore-grid" style={{ padding: 'var(--lux-space-64) var(--lux-space-24)', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <span className="lux-ui-sans" style={{ color: 'var(--lux-champagne)' }}>Sovereign Specifications</span>
          <h2 className="lux-heading-serif" style={{ fontSize: '42px', marginTop: '8px' }}>Engineered for Total Assurance</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
          {[
            {
              title: 'Fail-Closed Edge Sandbox',
              desc: 'Runs directly in WebGPU. Any browser modification or external copilot injection immediately locks down the session.'
            },
            {
              title: 'Dual-Modal Telemetry Fusion',
              desc: 'Correlates 468 MediaPipe facial landmarks with Pupillary Light Reflex (PLR) dynamics to eliminate 3D deepfakes.'
            },
            {
              title: 'Zero Video Stream Exposure',
              desc: 'All biometrics compute client-side (< 200ms). Only cryptographic JSON vector signatures transmit over TLS 1.3.'
            }
          ].map((item, idx) => (
            <div key={idx} style={{
              background: 'var(--lux-charcoal)',
              border: '1px solid rgba(201, 167, 107, 0.2)',
              borderRadius: '16px',
              padding: '32px',
              transition: 'transform 0.3s ease'
            }}>
              <h3 className="lux-heading-serif" style={{ fontSize: '24px', color: 'var(--lux-champagne)', marginBottom: '12px' }}>
                {item.title}
              </h3>
              <p className="lux-body-sans" style={{ fontSize: '15px' }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Concierge Modal */}
      <LuxConciergePopup 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        onComplete={() => {
          setModalOpen(false);
          onComplete?.();
        }}
      />

      {/* Sticky Status Bar */}
      <footer style={{
        padding: '24px',
        borderTop: '1px solid rgba(201, 167, 107, 0.15)',
        textAlign: 'center',
        background: 'var(--lux-charcoal)',
        fontSize: '13px',
        color: 'rgba(247, 245, 242, 0.5)'
      }}>
        Aegis Interview Room · World-Class Sovereign Archonate Edition · Non-Destructive Isolated UI
      </footer>
    </div>
  );
}
