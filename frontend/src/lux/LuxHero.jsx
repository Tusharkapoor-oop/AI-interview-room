import React, { useEffect, useRef, useState } from 'react';

const SUBHEADLINE = "An invitation to experience the elite standard in AI-assisted technical interviews.";

const TRUST_METRICS = [
  { num: "2,847", label: "Interviews Secured" },
  { num: "99.3%", label: "Fraud Detection" },
  { num: "140ms", label: "Avg Latency" },
  { num: "GDPR", label: "Compliant" },
];

export default function LuxHero({ onBegin, onExplore }) {
  const canvasRef = useRef(null);
  const [typedText, setTypedText] = useState('');
  const [counters, setCounters] = useState([0, 0, 0, 0]);

  // Typewriter effect
  useEffect(() => {
    let index = 0;
    const delay = setTimeout(() => {
      const interval = setInterval(() => {
        setTypedText((prev) => prev + SUBHEADLINE.charAt(index));
        index++;
        if (index >= SUBHEADLINE.length) clearInterval(interval);
      }, 38);
      return () => clearInterval(interval);
    }, 1400);
    return () => clearTimeout(delay);
  }, []);

  // Animated counters
  useEffect(() => {
    const targets = [2847, 99.3, 140, 4];
    const duration = 2200;
    const stepMs = 16;
    const steps = duration / stepMs;
    let frame = 0;
    const timer = setInterval(() => {
      frame++;
      const progress = Math.min(frame / steps, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCounters(targets.map(t => Math.round(t * eased * 10) / 10));
      if (frame >= steps) clearInterval(timer);
    }, stepMs);
    return () => clearInterval(timer);
  }, []);

  // Nebula particle system
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Palette: champagne gold, cyan, violet
    const palette = [
      [201, 167, 107],  // champagne
      [34,  211, 238],  // cyan
      [167, 139, 250],  // violet
      [245, 200,  66],  // gold-bright
    ];

    const NUM = 520;
    const particles = Array.from({ length: NUM }, () => {
      const col = palette[Math.floor(Math.random() * palette.length)];
      return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.4 + 0.3,
        vy: -(Math.random() * 0.18 + 0.04),
        vx: (Math.random() - 0.5) * 0.08,
        alpha: Math.random() * 0.55 + 0.15,
        fade: (Math.random() * 0.008 + 0.002) * (Math.random() > 0.5 ? 1 : -1),
        col,
        twinkle: Math.random() * Math.PI * 2,
        twinkleSpeed: Math.random() * 0.03 + 0.01,
      };
    });

    // A few larger glowing orbs
    const orbs = Array.from({ length: 6 }, () => {
      const col = palette[Math.floor(Math.random() * palette.length)];
      return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 60 + 30,
        col,
        alpha: Math.random() * 0.06 + 0.02,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.01 + 0.005,
      };
    });

    let animId;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw soft glowing orbs
      orbs.forEach(o => {
        o.pulse += o.pulseSpeed;
        const a = o.alpha + Math.sin(o.pulse) * 0.02;
        const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        grad.addColorStop(0, `rgba(${o.col[0]},${o.col[1]},${o.col[2]},${a})`);
        grad.addColorStop(1, `rgba(${o.col[0]},${o.col[1]},${o.col[2]},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw particles
      particles.forEach(p => {
        p.y += p.vy;
        p.x += p.vx;
        p.alpha += p.fade;
        p.twinkle += p.twinkleSpeed;

        if (p.alpha <= 0.08 || p.alpha >= 0.75) p.fade = -p.fade;
        if (p.y < -5) { p.y = canvas.height + 5; p.x = Math.random() * canvas.width; }
        if (p.x < -5) p.x = canvas.width + 5;
        if (p.x > canvas.width + 5) p.x = -5;

        const a = p.alpha * (0.7 + Math.sin(p.twinkle) * 0.3);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.col[0]},${p.col[1]},${p.col[2]},${a})`;
        ctx.shadowBlur = p.r * 5;
        ctx.shadowColor = `rgba(${p.col[0]},${p.col[1]},${p.col[2]},${a * 0.8})`;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const formatNum = (i, n) => {
    if (i === 0) return n >= 1000 ? `${Math.floor(n).toLocaleString()}` : Math.floor(n);
    if (i === 1) return `${n.toFixed(1)}%`;
    if (i === 2) return `${Math.floor(n)}ms`;
    return 'GDPR';
  };

  return (
    <section className="lux-hero" aria-label="Welcome Journey">
      {/* Nebula particle canvas */}
      <canvas ref={canvasRef} className="lux-particle-overlay" aria-hidden="true" />

      <div className="lux-hero-content">
        {/* Elite badge */}
        <div className="lux-hero-badge" aria-label="Enterprise AI Platform">
          <span className="lux-hero-badge-dot" aria-hidden="true" />
          Enterprise · Biometric Intelligence Platform
        </div>

        {/* Headline with char-by-char gradient line */}
        <h1 className="lux-hero-headline">
          The Pinnacle of
          <span className="line-gold"> Biometric Integrity</span>
        </h1>

        {/* Typewriter subheadline */}
        <p className="lux-hero-subheadline" aria-live="polite">
          {typedText}
          <span className="lux-cursor" aria-hidden="true" />
        </p>

        {/* CTA buttons */}
        <div className="lux-cta-group">
          <button
            className="lux-btn lux-btn-primary"
            onClick={onBegin}
            aria-label="Begin Your Journey — open onboarding concierge"
          >
            Begin Your Journey
          </button>
          <button
            className="lux-btn lux-btn-secondary"
            onClick={onExplore}
            aria-label="Explore platform features"
          >
            Explore Features
          </button>
        </div>

        {/* Live trust ticker */}
        <div className="lux-trust-ticker" role="list" aria-label="Platform statistics">
          {TRUST_METRICS.map((m, i) => (
            <React.Fragment key={m.label}>
              {i > 0 && <div className="lux-trust-sep" aria-hidden="true" />}
              <div className="lux-trust-item" role="listitem">
                <span className="lux-trust-num">{formatNum(i, counters[i])}</span>
                <span className="lux-trust-label">{m.label}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
