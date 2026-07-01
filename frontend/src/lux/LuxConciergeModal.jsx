import React, { useEffect, useRef, useState } from 'react';

const STEPS = [
  {
    title: "Welcome to Elite Sanctum",
    desc: "Aria welcomes you to Aegis's highest echelon. We have set up a customized biometric framework tailored to capture your authentic presence and digital keystrokes.",
    speech: "Hello. I am your digital concierge. I will guide you through our authentication shield. Shall we begin?",
    avatarIcon: "⬡",
  },
  {
    title: "Continuous Verification",
    desc: "Aegis monitors face landmarks, gaze angles, and voice harmonics locally in real time. We guarantee data privacy: no raw video leaves your browser environment.",
    speech: "Our Layer 2 verification uses passive eye calibration. It verifies your presence continuously without disturbing your flow.",
    avatarIcon: "🛡️",
  },
  {
    title: "Keystroke & Audio Dynamics",
    desc: "A dynamic fingerprint is created based on your typing rhythms (dwell and flight timing) and microphone spectral energies, preventing remote control or human-in-the-middle assistance.",
    speech: "We capture the speed and rhythm of your input to ensure it is you who is writing every line of code.",
    avatarIcon: "🎹",
  },
  {
    title: "Request Access Key",
    desc: "Unlock your session by validating your invitation credentials or request a luxury key from our admissions deck below.",
    speech: "We are ready to calibrate. Please enter your invitation details to establish your secure room.",
    avatarIcon: "🔑",
  }
];

export default function LuxConciergeModal({ isOpen, onClose, onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);

  // Keyboard navigation & Focus Trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const modal = modalRef.current;
        if (!modal) return;
        const focusableElements = modal.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    
    // Set initial focus to close button
    setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 100);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const step = STEPS[currentStep];
  const progressPercent = ((currentStep + 1) / STEPS.length) * 100;

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete?.();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    onComplete?.();
  };

  const handleReplay = () => {
    setCurrentStep(0);
  };

  return (
    <div 
      className="lux-modal-backdrop" 
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div 
        ref={modalRef}
        className="lux-modal" 
        role="dialog" 
        aria-modal="true"
        aria-labelledby="lux-tour-title"
        aria-describedby="lux-tour-desc"
      >
        {/* Close Button */}
        <button 
          ref={closeButtonRef}
          className="lux-modal-close" 
          onClick={onClose}
          aria-label="Close onboarding modal"
        >
          ✕
        </button>

        <div className="lux-modal-content">
          {/* Concierge Silhouette Guide */}
          <div className="lux-concierge-avatar-wrap">
            <div className="lux-concierge-silhouette" aria-hidden="true">
              <span className="lux-concierge-icon">{step.avatarIcon}</span>
              <div 
                style={{
                  position: 'absolute',
                  inset: '-4px',
                  borderRadius: '50%',
                  border: '1.5px dashed var(--lux-champagne)',
                  animation: 'spin 12s linear infinite',
                  opacity: 0.4
                }}
              />
            </div>
          </div>

          {/* Speech Bubble */}
          <div 
            style={{
              background: 'rgba(201, 167, 107, 0.08)',
              border: '1px solid rgba(201, 167, 107, 0.2)',
              borderRadius: '12px',
              padding: '16px var(--lux-space-24)',
              position: 'relative',
              textAlign: 'center',
              fontSize: '14px',
              fontStyle: 'italic',
              color: 'var(--lux-champagne)',
              fontFamily: 'var(--lux-font-serif)'
            }}
          >
            "{step.speech}"
            <div 
              style={{
                position: 'absolute',
                top: '-8px',
                left: '50%',
                transform: 'translateX(-50%) rotate(45deg)',
                width: '14px',
                height: '14px',
                background: '#161619',
                borderLeft: '1px solid rgba(201, 167, 107, 0.2)',
                borderTop: '1px solid rgba(201, 167, 107, 0.2)',
              }}
            />
          </div>

          {/* Tour Step Title & Desc */}
          <div style={{ marginTop: '8px' }}>
            <h2 id="lux-tour-title" className="lux-tour-step-title">
              {step.title}
            </h2>
            <p id="lux-tour-desc" className="lux-tour-step-desc">
              {step.desc}
            </p>
          </div>

          {/* Progress Indicator */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '500', color: 'rgba(247, 245, 242, 0.4)' }}>
              <span>CONCIERGE PROGRESS</span>
              <span>{currentStep + 1} OF {STEPS.length}</span>
            </div>
            <div className="lux-progress-track">
              <div 
                className="lux-progress-fill" 
                style={{ width: `${progressPercent}%` }} 
                role="progressbar"
                aria-valuenow={progressPercent}
                aria-valuemin="0"
                aria-valuemax="100"
              />
            </div>
          </div>

          {/* Controls */}
          <div className="lux-tour-controls">
            <div>
              {currentStep > 0 ? (
                <button 
                  className="lux-tour-btn-link" 
                  onClick={handleBack}
                  aria-label="Go back to previous onboarding step"
                >
                  ← Back
                </button>
              ) : (
                <button 
                  className="lux-tour-btn-link" 
                  onClick={handleSkip}
                  aria-label="Skip onboarding walkthrough"
                >
                  Skip Tour
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              {currentStep === STEPS.length - 1 && (
                <button 
                  className="lux-tour-btn-link" 
                  onClick={handleReplay}
                  aria-label="Restart tour from step one"
                >
                  Replay
                </button>
              )}
              <button 
                className="lux-tour-btn-solid" 
                onClick={handleNext}
                aria-label={currentStep === STEPS.length - 1 ? "Finish and enter room" : "Proceed to next onboarding step"}
              >
                {currentStep === STEPS.length - 1 ? "Begin" : "Next →"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
