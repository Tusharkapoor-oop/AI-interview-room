/**
 * NeuralBg.jsx — Interactive Neural Network Background
 * Canvas-based synaptic animation that reacts to anomaly events.
 * Nodes pulse and edges fire on anomaly triggers.
 */
import React, { useEffect, useRef, useCallback } from 'react';

const NODE_COUNT = 55;
const EDGE_DISTANCE = 160;

function initNodes(w, h) {
  return Array.from({ length: NODE_COUNT }, (_, i) => ({
    id: i,
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.35,
    vy: (Math.random() - 0.5) * 0.35,
    r: 1.5 + Math.random() * 2.5,
    pulse: 0,
    hue: 190 + Math.random() * 80,
  }));
}

export default function NeuralBg({ anomaly = false, style = {} }) {
  const canvasRef = useRef(null);
  const nodesRef  = useRef([]);
  const rafRef    = useRef(null);
  const anomalyRef = useRef(false);

  useEffect(() => { anomalyRef.current = anomaly; }, [anomaly]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const nodes = nodesRef.current;
    const isAnomaly = anomalyRef.current;

    ctx.clearRect(0, 0, w, h);

    // Update node positions
    nodes.forEach(n => {
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > w) n.vx *= -1;
      if (n.y < 0 || n.y > h) n.vy *= -1;

      // Decay pulse
      if (n.pulse > 0) n.pulse *= 0.92;

      // Anomaly trigger: random nodes spike
      if (isAnomaly && Math.random() < 0.004) {
        n.pulse = 1;
        n.hue = 355; // red hue
      } else if (!isAnomaly && n.hue > 270) {
        n.hue += (220 - n.hue) * 0.03;
      }
    });

    // Draw edges
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > EDGE_DISTANCE) continue;

        const alpha = (1 - dist / EDGE_DISTANCE) * 0.18;
        const pulseFactor = Math.max(nodes[i].pulse, nodes[j].pulse);
        const hue = isAnomaly ? 355 : nodes[i].hue;

        ctx.beginPath();
        ctx.strokeStyle = `hsla(${hue}, 80%, 65%, ${alpha + pulseFactor * 0.4})`;
        ctx.lineWidth = 0.7 + pulseFactor * 2;
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();

        // Firing synapse particle
        if (pulseFactor > 0.3) {
          const t = (Date.now() % 1000) / 1000;
          const px = nodes[i].x + (nodes[j].x - nodes[i].x) * t;
          const py = nodes[i].y + (nodes[j].y - nodes[i].y) * t;
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue}, 100%, 80%, ${pulseFactor * 0.8})`;
          ctx.fill();
        }
      }
    }

    // Draw nodes
    nodes.forEach(n => {
      const glow = 3 + n.pulse * 12;
      const hue = isAnomaly && n.pulse > 0.3 ? 355 : n.hue;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + n.pulse * 4, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 80%, 70%, ${0.6 + n.pulse * 0.4})`;
      ctx.shadowBlur = glow;
      ctx.shadowColor = `hsl(${hue}, 90%, 60%)`;
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      nodesRef.current = initNodes(canvas.width, canvas.height);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        opacity: anomaly ? 0.55 : 0.28,
        transition: 'opacity 0.8s ease',
        ...style,
      }}
    />
  );
}
