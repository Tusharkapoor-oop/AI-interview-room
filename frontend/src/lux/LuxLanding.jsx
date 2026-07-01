import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import LuxHero from './LuxHero';
import LuxConciergeModal from './LuxConciergeModal';
import LuxFeatures from './LuxFeatures';
import LuxResearchStats from './LuxResearchStats';
import LuxTimeline from './LuxTimeline';
import LuxTestimonials from './LuxTestimonials';
import LuxInviteForm from './LuxInviteForm';
import LuxFooter from './LuxFooter';
import './LuxTheme.css';

export default function LuxLanding({ onComplete, initialReducedMotion = false }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(initialReducedMotion);

  const handleBegin = () => {
    setModalOpen(true);
  };

  const handleExplore = () => {
    document.getElementById('lux-explore-anchor')?.scrollIntoView({ behavior: 'smooth' });
  };

  const toggleMotion = () => {
    setReducedMotion((prev) => !prev);
  };

  return (
    <div className={`lux-wrapper ${reducedMotion ? 'lux-reduced-motion' : ''}`}>
      {/* Motion toggle accessibility controller */}
      <button
        onClick={toggleMotion}
        style={{
          position: 'fixed',
          top: '12px',
          left: '12px',
          zIndex: 5000,
          background: 'rgba(11, 11, 13, 0.6)',
          border: '1px solid rgba(201, 167, 107, 0.3)',
          color: 'var(--lux-champagne)',
          fontSize: '11px',
          padding: '6px 14px',
          borderRadius: '20px',
          cursor: 'pointer',
          fontFamily: 'var(--lux-font-sans)',
          fontWeight: '600',
          letterSpacing: '0.05em',
          backdropFilter: 'blur(8px)',
          outline: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
        }}
        aria-label="Toggle motion reduction"
      >
        {reducedMotion ? "Enable Animations" : "Reduce Motion"}
      </button>

      {/* Cinematic Hero */}
      <LuxHero onBegin={handleBegin} onExplore={handleExplore} />

      {/* Anchor for explore */}
      <div id="lux-explore-anchor" />

      {/* Feature Grid */}
      <LuxFeatures />

      {/* Research Statistics — Academic grounding */}
      <LuxResearchStats />

      {/* Vertical Timeline */}
      <LuxTimeline />

      {/* Testimonials Slider */}
      <LuxTestimonials />

      {/* Access Code/Invite Registration Box */}
      <LuxInviteForm onSuccess={onComplete} />

      {/* Concierge Modal */}
      <LuxConciergeModal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        onComplete={() => {
          setModalOpen(false);
          onComplete?.();
        }}
      />

      {/* Status Bar Footer */}
      <LuxFooter />
    </div>
  );
}

// Scoped mounting hook for non-destructive DOM initialization
if (typeof window !== 'undefined') {
  window.mountLuxLanding = function (containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Container element #${containerId} not found.`);
      return null;
    }
    const root = ReactDOM.createRoot(container);
    root.render(
      <LuxLanding 
        onComplete={options.onComplete} 
        initialReducedMotion={options.reducedMotion} 
      />
    );
    return () => root.unmount();
  };
}
