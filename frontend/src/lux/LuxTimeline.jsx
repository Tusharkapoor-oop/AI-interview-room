import React, { useEffect, useRef } from 'react';

const STEPS = [
  {
    step: "Step I",
    title: "Signature Identity Check",
    desc: "Verification of government-issued ID papers, multi-angle webcam scans, and AI liveness testing to cryptographically confirm candidate presence before any assessment begins."
  },
  {
    step: "Step II",
    title: "Passive Calibration",
    desc: "A fluid 9-point pupil calibration maps precise eye alignment coordinates. The system silently establishes your biometric baseline — invisible, non-disruptive, absolute."
  },
  {
    step: "Step III",
    title: "Live Arena Interview",
    desc: "A collaborative real-time session seamlessly conducting coding rounds, systems architecture, and behavioral assessments inside a fully audited, cryptographically sealed environment."
  },
  {
    step: "Step IV",
    title: "Multi-Modal Integrity Scoring",
    desc: "Post-session AI audit compiles motion logs, keystroke biometric baselines, gaze heat maps, and audio spectral graphs to produce an immutable multi-modal verification report."
  },
];

export default function LuxTimeline() {
  const itemRefs = useRef([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('lux-visible');
          }
        });
      },
      { threshold: 0.2 }
    );

    itemRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <section
      className="lux-timeline-section"
      aria-labelledby="lux-timeline-title"
    >
      <div className="lux-section-header">
        <span className="lux-section-subtitle">The Process</span>
        <h2 id="lux-timeline-title" className="lux-section-title">
          The Journey
        </h2>
      </div>

      <div className="lux-timeline" role="list">
        {STEPS.map((item, idx) => (
          <div
            key={idx}
            ref={(el) => (itemRefs.current[idx] = el)}
            className="lux-timeline-item"
            role="listitem"
            style={{ transitionDelay: `${idx * 0.12}s` }}
          >
            {/* Animated node */}
            <div className="lux-timeline-dot" aria-hidden="true">
              <div className="lux-timeline-dot-inner" />
            </div>

            <div className="lux-timeline-step">{item.step}</div>
            <h3 className="lux-timeline-title">{item.title}</h3>
            <p className="lux-timeline-desc">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
