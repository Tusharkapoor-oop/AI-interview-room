import React, { useState, useEffect, useCallback } from 'react';

const TESTIMONIALS = [
  {
    text: "Aegis revolutionized our leadership recruitment pipeline. The combination of passive biometric integrity and collaborative coding represents the highest standard in talent assessments we have ever encountered.",
    author: "Elena Rostova",
    initials: "ER",
    role: "Director of Talent, Vesper Global",
    stars: 5,
  },
  {
    text: "The integration was entirely non-destructive and seamless. Our candidates appreciate the privacy guarantees, and our compliance auditors trust the multi-modal score analytics implicitly.",
    author: "Marcus Wren",
    initials: "MW",
    role: "VP of Engineering, Sterling & Shield",
    stars: 5,
  },
  {
    text: "An invitation to premium hiring. Gaze mapping and keystroke verification completely neutralized mock interviews and code cheating at FAANG-level difficulty.",
    author: "Siddharth Mehta",
    initials: "SM",
    role: "Chief Architect, Neoteric AI",
    stars: 5,
  },
];

const AUTO_ADVANCE_MS = 5200;

export default function LuxTestimonials() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = TESTIMONIALS.length;

  const next = useCallback(() => setActive(a => (a + 1) % total), [total]);
  const prev = useCallback(() => setActive(a => (a - 1 + total) % total), [total]);

  // Auto-advance
  useEffect(() => {
    if (paused) return;
    const t = setInterval(next, AUTO_ADVANCE_MS);
    return () => clearInterval(t);
  }, [paused, next]);

  const getCardClass = (idx) => {
    if (idx === active) return 'active';
    if (idx === (active - 1 + total) % total) return 'prev';
    if (idx === (active + 1) % total) return 'next';
    return 'hidden';
  };

  return (
    <section
      className="lux-testimonials-section"
      aria-label="Client Testimonials"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="lux-section-header">
        <span className="lux-section-subtitle">Social Proof</span>
        <h2 className="lux-section-title">Trusted by the Elite</h2>
      </div>

      <div className="lux-testimonials-inner" aria-live="polite">
        {TESTIMONIALS.map((t, idx) => (
          <div
            key={idx}
            className={`lux-testimonial-card ${getCardClass(idx)}`}
            aria-hidden={idx !== active}
          >
            <span className="lux-quote-icon" aria-hidden="true">"</span>

            {/* Stars */}
            <div className="lux-stars" aria-label={`${t.stars} out of 5 stars`}>
              {Array.from({ length: t.stars }).map((_, si) => (
                <span
                  key={si}
                  className="lux-star"
                  style={{ animationDelay: `${si * 0.07}s` }}
                  aria-hidden="true"
                >★</span>
              ))}
            </div>

            <blockquote className="lux-testimonial-text">
              {t.text}
            </blockquote>

            <div className="lux-testimonial-author-row">
              <div className="lux-testimonial-avatar" aria-hidden="true">
                {t.initials}
              </div>
              <div>
                <div className="lux-testimonial-author">{t.author}</div>
                <div className="lux-testimonial-role">{t.role}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="lux-carousel-controls" role="group" aria-label="Testimonial controls">
        <button
          className="lux-carousel-arrow"
          onClick={prev}
          aria-label="Previous testimonial"
        >‹</button>

        {TESTIMONIALS.map((_, idx) => (
          <button
            key={idx}
            className={`lux-carousel-dot ${active === idx ? 'active' : ''}`}
            onClick={() => setActive(idx)}
            aria-label={`View testimonial ${idx + 1}`}
            aria-current={active === idx}
          />
        ))}

        <button
          className="lux-carousel-arrow"
          onClick={next}
          aria-label="Next testimonial"
        >›</button>
      </div>
    </section>
  );
}
