/**
 * LuxResearchStats.jsx — Research Module 6
 *
 * Academic grounding section for LuxLanding.
 * Displays verified statistics from the AI Interview deep research
 * report with animated counters, source attribution, and visual impact.
 *
 * Stats sourced from:
 *   - Karat Research: 80% LLM usage on code tests
 *   - Resume Templates study: 71% of candidates admit cheating
 *   - IJSRA: 91.4% eye tracking F1, 93.7% hand gesture F1
 *   - Fabric: 85% detection, 20+ signals, $50K+ bad hire cost
 *   - Gartner: 25% fake profiles by 2028
 *   - interviewing.io: 81% of FAANG interviewers suspect AI cheating
 */
import React, { useEffect, useRef, useState } from 'react';
import '../lux/LuxTheme.css';

const STATS = [
  {
    value: 71,
    suffix: '%',
    label: 'of candidates admit cheating',
    source: 'Resume Templates Study',
    color: 'var(--lux-red, #ef4444)',
    icon: '⚠',
    desc: '7 in 10 recent job seekers admitted to cheating during the hiring process',
  },
  {
    value: 80,
    suffix: '%',
    label: 'use LLMs on code tests',
    source: 'Karat Research',
    color: 'var(--lux-amber, #f59e0b)',
    icon: '🤖',
    desc: 'of candidates use language models on coding assessments despite explicit prohibition',
  },
  {
    value: 91.4,
    suffix: '%',
    label: 'eye tracking F1 accuracy',
    source: 'IJSRA · MediaPipe Study',
    color: 'var(--lux-cyan, #22d3ee)',
    icon: '👁',
    desc: 'AI-based proctoring achieves 91.4% F1-score in eye movement detection via MediaPipe + OpenCV',
    decimal: true,
  },
  {
    value: 93.7,
    suffix: '%',
    label: 'hand gesture F1 accuracy',
    source: 'IJSRA · MediaPipe Study',
    color: 'var(--lux-cyan, #22d3ee)',
    icon: '🖐',
    desc: '21-point hand landmark tracking achieves 93.7% F1-score in gesture violation detection',
    decimal: true,
  },
  {
    value: 50,
    prefix: '$',
    suffix: 'K+',
    label: 'cost of one bad hire',
    source: 'Fabric · Industry Analysis',
    color: 'var(--lux-gold, #f59e0b)',
    icon: '💸',
    desc: 'Direct expenses per bad hire including wasted salary (3–6 months), productivity loss, and re-hiring',
  },
  {
    value: 25,
    suffix: '%',
    label: 'fake profiles by 2028',
    source: 'Gartner Projection',
    color: 'var(--lux-red, #ef4444)',
    icon: '🎭',
    desc: 'Gartner projects 1 in 4 candidate profiles will be proven fake by 2028',
  },
];

function AnimatedCounter({ target, duration = 2200, decimal = false, prefix = '', suffix = '' }) {
  const [display, setDisplay] = useState(0);
  const startRef  = useRef(null);
  const rafRef    = useRef(null);
  const hasStarted = useRef(false);
  const elRef     = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !hasStarted.current) {
        hasStarted.current = true;
        startRef.current = performance.now();
        const animate = (now) => {
          const elapsed = now - startRef.current;
          const t = Math.min(elapsed / duration, 1);
          // Cubic ease-out
          const eased = 1 - Math.pow(1 - t, 3);
          const value = target * eased;
          setDisplay(decimal ? parseFloat(value.toFixed(1)) : Math.floor(value));
          if (t < 1) rafRef.current = requestAnimationFrame(animate);
          else setDisplay(target);
        };
        rafRef.current = requestAnimationFrame(animate);
      }
    }, { threshold: 0.3 });

    if (elRef.current) observer.observe(elRef.current);
    return () => {
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, decimal]);

  return (
    <span ref={elRef}>
      {prefix}{decimal ? display.toFixed(1) : display}{suffix}
    </span>
  );
}

export default function LuxResearchStats() {
  return (
    <section style={{
      padding: '100px 24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(239,68,68,0.04) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Section header */}
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 18px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 99,
            fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.15em',
            textTransform: 'uppercase', color: '#ef4444',
            marginBottom: 24,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', display: 'inline-block', animation: 'lux-blink-cursor 1.2s ease-in-out infinite' }} />
            Peer-Reviewed Research · Industry Data
          </div>
          <h2 style={{
            fontFamily: 'var(--lux-font-serif, Georgia, serif)',
            fontSize: 'clamp(2rem, 4vw, 3rem)',
            fontWeight: 700,
            color: '#f8f4ef',
            lineHeight: 1.2,
            marginBottom: 16,
          }}>
            The Cheating Crisis Is Real
          </h2>
          <p style={{
            fontSize: '1rem', color: 'rgba(248,244,239,0.6)',
            maxWidth: 560, margin: '0 auto', lineHeight: 1.7,
          }}>
            Multi-source academic and industry research on AI interview fraud — why
            legacy proctoring fails and what AEGIS's multi-modal approach detects.
          </p>
        </div>

        {/* Stats grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 20,
        }}>
          {STATS.map((stat, i) => (
            <StatCard key={i} stat={stat} index={i} />
          ))}
        </div>

        {/* Bottom attribution */}
        <div style={{
          marginTop: 48, textAlign: 'center',
          padding: '16px 24px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12,
        }}>
          <p style={{ fontSize: '0.72rem', color: 'rgba(248,244,239,0.35)', lineHeight: 1.8, margin: 0 }}>
            Sources: Resume Templates Study · Karat Research · International Journal of Science and Research Archive (IJSRA) ·
            Fabric Platform Analysis · interviewing.io FAANG Survey · Gartner 2024 Hiring Forecast ·
            Harjai AI Behavioral Report · UC Berkeley "Gotcha" deepfake research (arXiv)
          </p>
        </div>
      </div>
    </section>
  );
}

function StatCard({ stat, index }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '28px 28px',
        background: hovered ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${hovered ? stat.color + '40' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 20,
        transition: 'all 0.35s cubic-bezier(0.23,1,0.32,1)',
        cursor: 'default',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: hovered ? `0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px ${stat.color}20` : 'none',
        transform: hovered ? 'translateY(-4px)' : 'none',
      }}
    >
      {/* Accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: stat.color,
        opacity: hovered ? 1 : 0.4,
        boxShadow: `0 0 8px ${stat.color}`,
        transition: 'opacity 0.3s',
      }} />

      {/* Glow bg */}
      <div style={{
        position: 'absolute', inset: 0, opacity: hovered ? 0.06 : 0,
        background: `radial-gradient(ellipse 70% 60% at 30% 40%, ${stat.color}, transparent)`,
        transition: 'opacity 0.4s',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative' }}>
        {/* Icon + source */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <span style={{ fontSize: '1.6rem' }}>{stat.icon}</span>
          <span style={{
            fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'rgba(248,244,239,0.3)',
            padding: '3px 8px',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 99, border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {stat.source}
          </span>
        </div>

        {/* Animated number */}
        <div style={{
          fontFamily: 'var(--lux-font-mono, monospace)',
          fontSize: 'clamp(2.2rem, 4vw, 3rem)',
          fontWeight: 900,
          color: stat.color,
          lineHeight: 1,
          marginBottom: 8,
          textShadow: `0 0 30px ${stat.color}60`,
          letterSpacing: '-0.02em',
        }}>
          <AnimatedCounter
            target={stat.value}
            prefix={stat.prefix || ''}
            suffix={stat.suffix || ''}
            decimal={stat.decimal}
          />
        </div>

        {/* Label */}
        <div style={{
          fontSize: '1rem', fontWeight: 700,
          color: 'rgba(248,244,239,0.85)',
          marginBottom: 10,
          lineHeight: 1.3,
        }}>
          {stat.label}
        </div>

        {/* Description */}
        <p style={{
          fontSize: '0.75rem', color: 'rgba(248,244,239,0.45)',
          lineHeight: 1.65, margin: 0,
        }}>
          {stat.desc}
        </p>
      </div>
    </div>
  );
}
