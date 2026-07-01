import React, { useRef, useCallback } from 'react';

const FEATURES = [
  {
    icon: "👁️",
    stat: "99.7%",
    title: "Pupillary & Gaze Tracking",
    desc: "Advanced gaze alignment mapping and dynamic liveness dot tracking detect secondary screen assistance or deepfake avatars in real time."
  },
  {
    icon: "🎹",
    stat: "< 12ms",
    title: "Keystroke Profiling",
    desc: "Dwell times and flight speeds build a unique biometric fingerprint that prevents virtual keyboard assistance and remote control software."
  },
  {
    icon: "🎙️",
    stat: "256-bit",
    title: "Spectral Energy Analysis",
    desc: "Passive micro-audio monitoring matches speaker identification and intercepts secondary voices or whisper feeds during the session."
  },
  {
    icon: "🔒",
    stat: "Layer 5",
    title: "Digital Shielding",
    desc: "Multi-layer protection blocks copy-paste commands, virtual output screens, inspect elements, and suspicious peripheral monitors."
  },
];

function FeatureCard({ feat, index }) {
  const cardRef = useRef(null);

  const handleMouseMove = useCallback((e) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--mx', `${mx}%`);
    card.style.setProperty('--my', `${my}%`);

    // 3D tilt
    const rotX = ((e.clientY - rect.top) / rect.height - 0.5) * -8;
    const rotY = ((e.clientX - rect.left) / rect.width - 0.5) * 8;
    card.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-6px)`;
  }, []);

  const handleMouseLeave = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transform = '';
  }, []);

  return (
    <article
      ref={cardRef}
      className="lux-feature-card"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        animationDelay: `${index * 0.12}s`,
        transition: 'transform 0.15s ease, border-color 0.4s, box-shadow 0.4s',
      }}
    >
      <div className="lux-feature-icon-wrap" aria-hidden="true">
        <span className="lux-feature-icon">{feat.icon}</span>
      </div>

      <div className="lux-feature-stat" aria-label={`Statistic: ${feat.stat}`}>
        {feat.stat}
      </div>

      <h3 className="lux-feature-title">{feat.title}</h3>
      <p className="lux-feature-desc">{feat.desc}</p>
    </article>
  );
}

export default function LuxFeatures() {
  return (
    <section
      className="lux-features-section"
      aria-labelledby="lux-features-title"
      id="lux-explore-anchor"
    >
      <div className="lux-section-header">
        <span className="lux-section-subtitle">Pillars of Trust</span>
        <h2 id="lux-features-title" className="lux-section-title">
          Uncompromised Integrity
        </h2>
      </div>

      <div className="lux-features-grid">
        {FEATURES.map((feat, idx) => (
          <FeatureCard key={idx} feat={feat} index={idx} />
        ))}
      </div>
    </section>
  );
}
