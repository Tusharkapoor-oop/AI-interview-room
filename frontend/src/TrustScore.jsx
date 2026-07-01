/**
 * TrustScore.jsx
 * Animated SVG ring displaying the live Trust & Integrity score.
 */
import React, { useMemo } from 'react';

export default function TrustScore({ anomalyCount, sessionSeconds }) {
  const score = useMemo(() => {
    const penalty = Math.min(anomalyCount * 5, 70);
    return Math.max(100 - penalty, 30);
  }, [anomalyCount]);

  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (score / 100) * circumference;

  const color = score >= 80 ? '#06ffa5' : score >= 50 ? '#ffd166' : '#ff4d6d';

  return (
    <div className="trust-score-wrapper">
      <svg className="trust-ring-svg" width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <circle
          cx="40" cy="40" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 40 40)"
          style={{ transition: 'stroke-dashoffset 1s ease, stroke 0.5s ease', filter: `drop-shadow(0 0 6px ${color})` }}
        />
        <text x="40" y="45" textAnchor="middle" fontSize="13" fontWeight="800" fontFamily="JetBrains Mono, monospace" fill={color}>
          {score}
        </text>
      </svg>
      <div>
        <div className="trust-info-label">Trust Score</div>
        <div className="trust-info-score" style={{ color, fontSize: '1.4rem' }}>{score}%</div>
        <div className="trust-info-status">
          {score >= 80 ? '✓ Authentic' : score >= 50 ? '⚠ Suspicious' : '✗ High Risk'}
        </div>
      </div>
    </div>
  );
}
