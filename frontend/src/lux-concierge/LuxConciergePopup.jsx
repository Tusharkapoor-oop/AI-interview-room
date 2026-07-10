import React, { useState, useEffect, useRef } from 'react';

const TOUR_STEPS = [
  {
    title: 'Welcome to Sovereign Sanctuary',
    subtitle: 'The Apex of Executive Intelligence',
    copy: 'You are stepping into a fail-closed, ultra-secure evaluation arena. Every signal is protected by holographic boundary encryption.',
    speech: 'Welcome. I am your concierge guide. Allow me to introduce our zero-compromise assessment environment.'
  },
  {
    title: 'Signature Dual-Modal Telemetry',
    subtitle: 'Continuous Gaze & PLR Verification',
    copy: 'Our local WebGPU engine correlates 468 facial landmarks with physiological Pupillary Light Reflexes at sub-200ms latency without cloud video streaming.',
    speech: 'We observe cognitive integrity through physiological resonance, ensuring complete authenticity while respecting your data sovereignty.'
  },
  {
    title: 'How The Protocol Works',
    subtitle: 'Sandbox Isolation & Liveness',
    copy: 'Before entering the arena, you will undergo brief calibration. Unauthorized secondary displays or virtual injection extensions immediately trigger a fail-closed security lock.',
    speech: 'The protocol is non-negotiable and deterministic. Fairness is guaranteed through mathematical precision.'
  },
  {
    title: 'Claim Your Invitation',
    subtitle: 'Begin Your Causal Session',
    copy: 'Your session token is ready. Proceeding will verify your hardware capabilities and initiate the secure interview sequence.',
    speech: 'Your secure container awaits. When you are ready, press Complete Tour to launch.'
  }
];

export default function LuxConciergePopup({ isOpen, onClose, onComplete }) {
  const [stepIndex, setStepIndex] = useState(0);
  const modalRef = useRef(null);
  const stepRef = useRef(stepIndex);

  useEffect(() => {
    stepRef.current = stepIndex;
  }, [stepIndex]);

  useEffect(() => {
    if (!isOpen) return;

    setTimeout(() => setStepIndex(0), 0);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      } else if (e.key === 'ArrowRight') {
        if (stepRef.current < TOUR_STEPS.length - 1) setStepIndex(prev => prev + 1);
      } else if (e.key === 'ArrowLeft') {
        if (stepRef.current > 0) setStepIndex(prev => prev - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentStep = TOUR_STEPS[stepIndex];
  const progressPercent = ((stepIndex + 1) / TOUR_STEPS.length) * 100;

  return (
    <div 
      className="lux-modal-backdrop" 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="lux-modal-title"
      aria-describedby="lux-modal-desc"
    >
      <div className="lux-modal-card" ref={modalRef} tabIndex={-1}>
        {/* Header & Close */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div className="lux-ui-sans" style={{ color: 'var(--lux-champagne)' }}>
            Concierge Onboarding · Step {stepIndex + 1} of {TOUR_STEPS.length}
          </div>
          <button 
            onClick={onClose}
            aria-label="Close concierge modal"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--lux-ivory)',
              fontSize: '20px',
              cursor: 'pointer',
              opacity: 0.6
            }}
          >
            ✕
          </button>
        </div>

        {/* Mascot & Speech Bubble */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <div className="lux-modal-mascot" aria-hidden="true">
            🦅
          </div>
          <div style={{ 
            background: 'rgba(201, 167, 107, 0.12)', 
            border: '1px solid rgba(201, 167, 107, 0.3)',
            borderRadius: '12px',
            padding: '12px 16px',
            fontSize: '14px',
            fontStyle: 'italic',
            color: 'var(--lux-champagne-light)',
            flex: 1
          }}>
            "{currentStep.speech}"
          </div>
        </div>

        {/* Content */}
        <h2 id="lux-modal-title" className="lux-heading-serif" style={{ fontSize: '36px', marginBottom: '8px' }}>
          {currentStep.title}
        </h2>
        <div className="lux-ui-sans" style={{ color: 'var(--lux-champagne)', marginBottom: '16px' }}>
          {currentStep.subtitle}
        </div>
        <p id="lux-modal-desc" className="lux-body-sans" style={{ marginBottom: '24px' }}>
          {currentStep.copy}
        </p>

        {/* Progress Bar */}
        <div className="lux-progress-bar" role="progressbar" aria-valuenow={stepIndex + 1} aria-valuemin={1} aria-valuemax={TOUR_STEPS.length}>
          <div className="lux-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '32px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="lux-btn-ghost" 
              style={{ padding: '10px 20px', fontSize: '12px' }}
              onClick={() => setStepIndex(0)}
              aria-label="Replay onboarding tour"
            >
              Replay
            </button>
            <button 
              className="lux-btn-ghost" 
              style={{ padding: '10px 20px', fontSize: '12px' }}
              onClick={onClose}
              aria-label="Skip onboarding tour"
            >
              Skip
            </button>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            {stepIndex > 0 && (
              <button 
                className="lux-btn-ghost" 
                style={{ padding: '10px 24px', fontSize: '12px' }}
                onClick={() => setStepIndex(prev => prev - 1)}
              >
                Back
              </button>
            )}
            {stepIndex < TOUR_STEPS.length - 1 ? (
              <button 
                className="lux-btn-primary" 
                style={{ padding: '10px 28px', fontSize: '12px' }}
                onClick={() => setStepIndex(prev => prev + 1)}
              >
                Next Step →
              </button>
            ) : (
              <button 
                className="lux-btn-primary" 
                style={{ padding: '10px 28px', fontSize: '12px' }}
                onClick={() => {
                  onComplete?.();
                }}
              >
                Enter Arena ✨
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
