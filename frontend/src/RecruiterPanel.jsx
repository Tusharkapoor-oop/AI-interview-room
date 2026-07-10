/**
 * RecruiterPanel.jsx
 * The permanent admin forensic dashboard — all telemetry permanently logged.
 */
import React, { useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import CyberAvatar from './CyberAvatar';
import TrustScore from './TrustScore';

function ForensicTimeline({ events }) {
  const listRef = useRef(null);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [events]);

  return (
    <div className="timeline-section">
      <div className="timeline-header">
        <span className="timeline-title">⚡ Forensic Event Log</span>
        <span className="timeline-count">{events.length} events</span>
      </div>
      <div className="timeline-events" ref={listRef}>
        {events.length === 0 && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '10px' }}>
            No anomalies detected yet.
          </div>
        )}
        {events.map((ev, i) => (
          <div key={i} className="timeline-event">
            <span className="event-time">{ev.time}</span>
            <span className="event-desc">{ev.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RecruiterPanel({ telemetry, events, sessionSeconds }) {
  const { gaze_anomaly, hands_visible, pose } = telemetry;
  const anomalyCount = events.length;

  return (
    <div className="recruiter-panel">
      {/* 3D Avatar Canvas */}
      <div className="avatar-canvas-wrapper">
        <Canvas camera={{ position: [0, 0, 6], fov: 50 }}>
          <CyberAvatar pose={pose} anomaly={gaze_anomaly} />
          <OrbitControls enableZoom={false} enablePan={false} autoRotate={false} />
        </Canvas>
        <div className="avatar-label">Digital Twin · Bias Mask Active</div>
      </div>

      {/* Trust Score */}
      <TrustScore anomalyCount={anomalyCount} sessionSeconds={sessionSeconds} />

      {/* Live Metrics */}
      <div className="metrics-section">
        <div className="section-label">Live Biometrics</div>

        <div className="metric-card">
          <div className="metric-label">Gaze Alignment</div>
          <div className={`metric-value ${gaze_anomaly ? 'alert' : 'safe'}`}>
            {gaze_anomaly ? '⚠ ANOMALY' : '✓ STABLE'}
          </div>
          <div className="euler-grid">
            {[['P', pose?.pitch], ['Y', pose?.yaw], ['R', pose?.roll]].map(([axis, val]) => (
              <div key={axis} className="euler-item">
                <div className="euler-axis">{axis}</div>
                <div className="euler-val">{Math.round(val || 0)}°</div>
              </div>
            ))}
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Hands in Frame</div>
          <div className={`metric-value ${hands_visible > 1 ? 'warn' : 'safe'}`}>
            {hands_visible} {hands_visible === 1 ? 'hand' : 'hands'}
          </div>
          <div className="metric-sub">
            {hands_visible > 1 ? '⚠ Multiple hands — possible device usage' : '✓ Normal'}
          </div>
        </div>
      </div>

      {/* Permanent Forensic Event Log */}
      <ForensicTimeline events={events} />
    </div>
  );
}
