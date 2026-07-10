/**
 * AudioWaveform.jsx — Real-time microphone waveform visualizer
 * Uses Web Audio API to capture mic input and render a bar waveform.
 * Shows speaking activity with animated bars.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';

export default function AudioWaveform({ active = true, color = '#3b82f6', barCount = 28 }) {
  const canvasRef  = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef  = useRef(null);
  const rafRef     = useRef(null);
  const ctxAudio   = useRef(null);
  const streamRef  = useRef(null);
  const [speaking, setSpeaking] = useState(false);
  const drawRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    analyser.getByteFrequencyData(data);

    ctx.clearRect(0, 0, w, h);

    const barW = (w / barCount) * 0.7;
    const gap  = (w / barCount) * 0.3;

    let maxAmp = 0;
    for (let i = 0; i < barCount; i++) {
      const idx  = Math.floor((i / barCount) * bufLen * 0.6);
      const amp  = data[idx] / 255;
      maxAmp = Math.max(maxAmp, amp);

      const barH = Math.max(3, amp * h * 0.88);
      const x    = i * (barW + gap);
      const y    = (h - barH) / 2;

      // Gradient per bar
      const grad = ctx.createLinearGradient(x, y, x, y + barH);
      grad.addColorStop(0, `${color}ff`);
      grad.addColorStop(0.5, `${color}cc`);
      grad.addColorStop(1, `${color}44`);

      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 3);
      ctx.fillStyle = grad;
      ctx.fill();

      // Glow
      ctx.shadowBlur = amp > 0.3 ? 8 : 0;
      ctx.shadowColor = color;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    setSpeaking(maxAmp > 0.08);
    rafRef.current = requestAnimationFrame(() => drawRef.current?.());
  }, [barCount, color]);

  useEffect(() => { drawRef.current = draw; }, [draw]);

  useEffect(() => {
    if (!active) return;

    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        streamRef.current = stream;
        ctxAudio.current = new AudioContext();
        analyserRef.current = ctxAudio.current.createAnalyser();
        analyserRef.current.fftSize = 128;
        analyserRef.current.smoothingTimeConstant = 0.75;
        sourceRef.current = ctxAudio.current.createMediaStreamSource(stream);
        sourceRef.current.connect(analyserRef.current);
        rafRef.current = requestAnimationFrame(() => drawRef.current?.());
      } catch {
        // Mic denied — show idle animation
        idleAnimation();
      }
    };

    const idleAnimation = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      const barW = (w / barCount) * 0.7;
      const gap  = (w / barCount) * 0.3;

      const tick = () => {
        ctx.clearRect(0, 0, w, h);
        const t = Date.now() / 600;
        for (let i = 0; i < barCount; i++) {
          const amp = 0.06 + 0.04 * Math.sin(t + i * 0.5);
          const barH = amp * h;
          const x = i * (barW + gap);
          const y = (h - barH) / 2;
          ctx.beginPath();
          ctx.roundRect(x, y, barW, barH, 2);
          ctx.fillStyle = `${color}44`;
          ctx.fill();
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    init();

    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      ctxAudio.current?.close();
    };
  }, [active, draw, barCount, color]);

  return (
    <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: '0.62rem', fontWeight: 700, letterSpacing: '1.5px',
        textTransform: 'uppercase', color: speaking ? color : 'var(--text-3)',
        transition: 'color 0.2s',
      }}>
        <span style={{
          width: 5, height: 5, borderRadius: '50%',
          background: speaking ? color : 'var(--text-4)',
          boxShadow: speaking ? `0 0 6px ${color}` : 'none',
          transition: 'all 0.2s',
        }} />
        {speaking ? 'Speaking' : 'Mic Active'}
      </div>
      <canvas
        ref={canvasRef}
        width={240}
        height={44}
        style={{ width: '100%', height: 44 }}
      />
    </div>
  );
}
