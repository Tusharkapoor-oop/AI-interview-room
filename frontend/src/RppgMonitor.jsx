/**
 * RppgMonitor.jsx — Remote Photoplethysmography Live Monitor Panel
 *
 * Paper §"Remote Photoplethysmography":
 *   Displays the live BPM extracted from webcam skin-color micro-variations,
 *   signal quality (SNR), and anti-spoofing verdict.
 *
 * Shows:
 *   - Animated pulse waveform (SVG path drawn from rolling green-channel data)
 *   - Live BPM number with heartbeat animation
 *   - SNR signal-strength bar
 *   - Anti-spoofing verdict: LIVE / WEAK / NO SIGNAL
 */
import React, { useEffect, useRef, useState } from 'react';

const STATUS_CONFIG = {
  initializing: { color: '#4a5c7a',   label: 'Calibrating…',  icon: '⏳' },
  live:          { color: 'var(--aegis-green)',   label: 'Live',          icon: '💚' },
  weak_signal:   { color: 'var(--aegis-amber)',   label: 'Weak Signal',   icon: '⚠' },
  no_signal:     { color: 'var(--aegis-red)',   label: 'No Heartbeat',  icon: '⛔' },
};

// ── Animated Pulse Waveform ────────────────────────────────────────────────────
function PulseWave({ bpm, status }) {
  const points = useRef([]);
  const rafRef  = useRef(null);
  const [path, setPath] = useState('');

  useEffect(() => {
    const isLive = status === 'live';
    const W = 200, H = 40;

    // Simulate ECG-like waveform driven by BPM if live
    const periodMs = isLive && bpm ? (60000 / bpm) : 1200;
    let t = 0;

    const tick = () => {
      t += 16;
      // ECG shape: flat baseline → P-wave bump → steep QRS complex → T-wave
      const phase = (t % periodMs) / periodMs; // 0–1
      let y;
      if (!isLive) {
        y = H / 2 + Math.sin(t / 400) * 2; // flatline with noise
      } else if (phase < 0.10) {
        y = H / 2 - Math.sin(phase / 0.10 * Math.PI) * 4; // P-wave
      } else if (phase < 0.15) {
        y = H / 2 + (phase - 0.10) / 0.05 * (H * 0.6); // Q dip
      } else if (phase < 0.18) {
        y = H / 2 - (phase - 0.15) / 0.03 * (H * 1.1); // R peak
      } else if (phase < 0.22) {
        y = H / 2 + (phase - 0.18) / 0.04 * (H * 0.3); // S dip
      } else if (phase < 0.40) {
        y = H / 2 - Math.sin((phase - 0.22) / 0.18 * Math.PI) * 6; // T-wave
      } else {
        y = H / 2 + (Math.random() - 0.5) * 1.5; // baseline noise
      }

      points.current.push(y);
      if (points.current.length > W) points.current.shift();

      if (points.current.length > 1) {
        const d = points.current.map((py, i) => `${i === 0 ? 'M' : 'L'}${i},${Math.max(2, Math.min(H - 2, py))}`).join(' ');
        setPath(d);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [bpm, status]);

  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.initializing;

  return (
    <svg width="100%" height="40" viewBox="0 0 200 40" preserveAspectRatio="none"
      style={{ display: 'block', borderRadius: 4, background: 'rgba(0,0,0,0.2)' }}>
      <defs>
        <linearGradient id="rppg-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={cfg.color} stopOpacity="0" />
          <stop offset="60%" stopColor={cfg.color} stopOpacity="0.8" />
          <stop offset="100%" stopColor={cfg.color} stopOpacity="1" />
        </linearGradient>
      </defs>
      {path && (
        <path d={path} fill="none" stroke="url(#rppg-grad)" strokeWidth="1.5" />
      )}
    </svg>
  );
}

// ── Signal Strength Bar ─────────────────────────────────────────────────────
function SignalBar({ strength, color }) {
  const bars = 5;
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 16 }}>
      {Array.from({ length: bars }).map((_, i) => {
        const threshold = (i + 1) / bars;
        const active = strength >= threshold;
        return (
          <div key={i} style={{
            width: 6,
            height: `${40 + i * 15}%`,
            background: active ? color : 'rgba(255,255,255,0.1)',
            borderRadius: 2,
            transition: 'background 0.4s',
          }} />
        );
      })}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function RppgMonitor({ rppgData }) {
  const { bpm, snr, isLive, signalStrength, status, sampleCount } = rppgData || {
    bpm: null, snr: 0, isLive: null, signalStrength: 0, status: 'initializing', sampleCount: 0,
  };

  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.initializing;
  const [beatAnim, setBeatAnim] = useState(false);

  // Pulse animation synchronized to BPM
  useEffect(() => {
    if (!bpm || !isLive) return;
    const interval = (60000 / bpm);
    const id = setInterval(() => {
      setBeatAnim(true);
      setTimeout(() => setBeatAnim(false), 150);
    }, interval);
    return () => clearInterval(id);
  }, [bpm, isLive]);

  return (
    <div className="mini-metric" style={{
      border: `1px solid ${isLive ? 'rgba(16,185,129,0.3)' : isLive === false ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
      background: isLive ? 'rgba(16,185,129,0.03)' : isLive === false ? 'rgba(239,68,68,0.03)' : 'transparent',
      transition: 'all 0.5s ease',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div className="mini-metric-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            fontSize: '0.9rem',
            transform: beatAnim ? 'scale(1.3)' : 'scale(1)',
            transition: 'transform 0.1s ease-out',
            display: 'inline-block',
          }}>🫀</span>
          rPPG Pulse
        </div>
        <div style={{
          fontSize: '0.58rem', fontWeight: 700, letterSpacing: '1px',
          textTransform: 'uppercase',
          color: cfg.color,
          background: `${cfg.color}18`,
          padding: '2px 7px', borderRadius: 99,
        }}>
          {cfg.icon} {cfg.label}
        </div>
      </div>

      {/* Waveform */}
      <PulseWave bpm={bpm} status={status} />

      {/* BPM + Signal row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        {/* BPM reading */}
        <div>
          <div style={{
            fontFamily: 'var(--mono)',
            fontWeight: 800,
            fontSize: bpm ? '1.4rem' : '1rem',
            color: bpm ? cfg.color : 'var(--text-3)',
            lineHeight: 1,
            transition: 'color 0.5s',
          }}>
            {bpm ? bpm : '—'}
            {bpm && <span style={{ fontSize: '0.6rem', fontWeight: 400, color: 'var(--text-3)', marginLeft: 4 }}>BPM</span>}
          </div>
          <div style={{ fontSize: '0.58rem', color: 'var(--text-3)', marginTop: 2 }}>
            {sampleCount < 150 ? `Sampling… (${Math.round(sampleCount / 3)}%)` : 'Heart Rate'}
          </div>
        </div>

        {/* Signal strength bars */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          <SignalBar strength={signalStrength} color={cfg.color} />
          <div style={{ fontSize: '0.58rem', color: 'var(--text-3)' }}>
            SNR {snr?.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Anti-spoofing note */}
      <div style={{
        marginTop: 7,
        padding: '4px 8px',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 4,
        fontSize: '0.6rem',
        color: 'var(--text-3)',
        lineHeight: 1.4,
      }}>
        Paper §rPPG — skin-color micro-variations via FFT.
        {isLive === false && (
          <span style={{ color: 'var(--aegis-red)', marginLeft: 4 }}>
            ⚠ No pulse — possible spoofing.
          </span>
        )}
      </div>
    </div>
  );
}
