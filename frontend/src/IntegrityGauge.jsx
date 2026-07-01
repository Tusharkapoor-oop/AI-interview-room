/**
 * IntegrityGauge.jsx
 * Animated SVG integrity score gauge (0–100).
 * Used in Recruiter Command Center.
 */
import React, { useMemo } from 'react';

export default function IntegrityGauge({ score }) {
  const radius = 52;
  const stroke = 7;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color = useMemo(() => {
    if (score >= 80) return 'var(--score-high)';
    if (score >= 50) return 'var(--score-mid)';
    return 'var(--score-low)';
  }, [score]);

  const verdict = score >= 80 ? 'High Integrity' : score >= 50 ? 'Moderate Risk' : 'High Risk';
  const verdictColor = color;

  return (
    <div className="score-section">
      <div className="score-gauge-wrap" role="meter" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label={`Integrity score: ${score}%`}>
        <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden="true">
          {/* Background track */}
          <circle
            cx="70" cy="70" r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={stroke}
          />
          {/* Score arc */}
          <circle
            cx="70" cy="70" r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 70 70)"
            style={{
              transition: 'stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1), stroke 0.5s ease',
              filter: `drop-shadow(0 0 8px ${color})`,
            }}
          />
          {/* Tick marks */}
          {[0, 25, 50, 75, 100].map((pct) => {
            const angle = (pct / 100) * 360 - 90;
            const rad = (angle * Math.PI) / 180;
            const x1 = 70 + (radius - 5) * Math.cos(rad);
            const y1 = 70 + (radius - 5) * Math.sin(rad);
            const x2 = 70 + (radius + 3) * Math.cos(rad);
            const y2 = 70 + (radius + 3) * Math.sin(rad);
            return <line key={pct} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />;
          })}
        </svg>

        <div className="score-center">
          <div className="score-number" style={{ color }}>{score}</div>
          <div className="score-label">/ 100</div>
        </div>
      </div>

      <div className="score-verdict" style={{ color: verdictColor }}>
        {score >= 80 ? '🔒' : score >= 50 ? '⚠️' : '🚨'} {verdict}
      </div>

      <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', textAlign: 'center', fontFamily: 'var(--mono)' }}>
        AEGIS INTEGRITY ENGINE v1.0
      </div>
    </div>
  );
}
