/**
 * CommandCenter.jsx
 * Phase 3: Recruiter "Command Center" — forensic dashboard.
 * PRD §4.3: Left 70% video player, Right 30% integrity + timeline.
 * Features:
 *  - Ghost View CV overlay toggle
 *  - Scrubable forensic timeline with click-to-jump
 *  - Integrity Score gauge
 *  - Multi-layer risk event log
 *  - AI-generated transcript panel
 */
import React, { useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useAegisStore } from './useAegisStore';
import IntegrityGauge from './IntegrityGauge';
import CyberAvatar from './CyberAvatar';
import HITLPanel from './HITLPanel';
import AgentStatusPanel from './AgentStatusPanel';
import ArtifactViewer from './ArtifactViewer';
import FraudScorePanel from './FraudScorePanel';
import GazeHeatmap from './GazeHeatmap';
import BehaviorTimeline from './BehaviorTimeline';
import MultiModalTrustScore from './MultiModalTrustScore';
import ExtensionThreatCatalog from './ExtensionThreatCatalog';
// ── Recruiter Video with Ghost Overlay ──────────────────────────
function VideoWithGhost({ ghostEnabled, telemetry }) {
  const videoRef = useRef(null);
  const screenRef = useRef(null);
  const [hasScreenShare, setHasScreenShare] = useState(false);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } })
      .then(s => { if (videoRef.current) videoRef.current.srcObject = s; })
      .catch(() => {});
      
    if (window.aegisScreenStream) {
      setHasScreenShare(true);
      if (screenRef.current) {
        screenRef.current.srcObject = window.aegisScreenStream;
      }
      const stream = window.aegisScreenStream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.addEventListener('ended', () => setHasScreenShare(false));
      }
    }

    return () => {
      videoRef.current?.srcObject?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video ref={videoRef} className="recruiter-video" style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }} autoPlay playsInline muted aria-label="Candidate video feed" />

        {ghostEnabled && (
          <div className="ghost-overlay" aria-label="CV analysis overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {/* Skeleton wireframe indicators */}
            <svg width="100%" height="100%" viewBox="0 0 640 480" preserveAspectRatio="xMidYMid slice">
              {/* Head position circle (derived from pose data) */}
              <circle cx="320" cy="200" r="60" fill="none" stroke="var(--aegis-cyan)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
              {/* Gaze vector arrow */}
              <line
                x1="320" y1="200"
                x2={320 + (telemetry.pose?.yaw || 0) * 3}
                y2={200 + (telemetry.pose?.pitch || 0) * 3}
                stroke={telemetry.gaze_anomaly ? 'var(--aegis-red)' : 'var(--aegis-green)'}
                strokeWidth="2"
                markerEnd="url(#arrow)"
              />
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill={telemetry.gaze_anomaly ? 'var(--aegis-red)' : 'var(--aegis-green)'} />
                </marker>
              </defs>
              {/* Landmark dots at key positions */}
              {[[320,200],[295,185],[345,185],[320,230],[300,255],[340,255]].map(([x,y], i) => (
                <circle key={i} cx={x} cy={y} r="3" fill="#4cc9f0" opacity="0.8" />
              ))}
              {/* Labels */}
              <text x="10" y="20" fill="var(--aegis-cyan)" fontSize="11" fontFamily="JetBrains Mono">
                GHOST VIEW — CV ANALYSIS ACTIVE
              </text>
              <text x="10" y="36" fill={telemetry.gaze_anomaly ? 'var(--aegis-red)' : 'var(--aegis-green)'} fontSize="10" fontFamily="JetBrains Mono">
                Yaw: {Math.round(telemetry.pose?.yaw||0)}° | Pitch: {Math.round(telemetry.pose?.pitch||0)}° | Roll: {Math.round(telemetry.pose?.roll||0)}°
              </text>
              <text x="10" y="52" fill={telemetry.gaze_anomaly ? 'var(--aegis-red)' : 'var(--aegis-green)'} fontSize="10" fontFamily="JetBrains Mono">
                Gaze: {telemetry.gaze_anomaly ? '⚠ ANOMALY' : '✓ STABLE'} | Hands: {telemetry.hands_visible||0}
              </text>
            </svg>
          </div>
        )}
      </div>

      {hasScreenShare && (
        <div style={{ flex: 1, position: 'relative', borderLeft: '1px solid var(--border)', background: '#000', overflow: 'hidden' }}>
          <video ref={screenRef} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'contain' }} autoPlay playsInline muted aria-label="Candidate screen share feed" />
          <div style={{
            position: 'absolute', top: 12, right: 12, zIndex: 10,
            background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: 'var(--aegis-red)',
            padding: '4px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 'bold', letterSpacing: '1px',
            display: 'flex', alignItems: 'center'
          }}>
            <span style={{ display: 'inline-block', width: 6, height: 6, background: 'var(--aegis-red)', borderRadius: '50%', marginRight: 6, boxShadow: '0 0 6px var(--aegis-red)' }} />
            LIVE SCREEN SHARE
          </div>
        </div>
      )}
    </div>
  );
}

// ── Scrubable Timeline ───────────────────────────────────────────
function ForensicTimeline({ events, sessionSeconds, onJump }) {
  const [hoveredEvent, setHoveredEvent] = useState(null);
  const playheadPct = sessionSeconds > 0 ? Math.min((sessionSeconds / Math.max(sessionSeconds + 60, 300)) * 100, 95) : 0;

  return (
    <div className="timeline-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div className="timeline-label">Forensic Timeline</div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
          {events.length} risk events recorded
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {['Gaze Track', 'Head Pose', 'Hands/Gesture'].map((layer) => (
          <div key={layer} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-3)', width: 80, flexShrink: 0, letterSpacing: '0.5px' }}>{layer}</div>
            <div className="timeline-track" style={{ minHeight: 36 }}>
              <div className="timeline-base" />

              {/* Playhead */}
              <div className="timeline-playhead" style={{ left: `${playheadPct}%` }} />

              {/* Risk markers */}
              {events
                .filter(ev => {
                  if (layer === 'Gaze Track')    return ev.type === 'GAZE_ANOMALY';
                  if (layer === 'Head Pose')     return ev.type === 'HEAD_TURN';
                  if (layer === 'Hands/Gesture') return ev.type === 'HAND_ANOMALY';
                  return false;
                })
                .map(ev => {
                  const pct = Math.min((ev.sessionSec / Math.max(sessionSeconds + 60, 300)) * 100, 95);
                  return (
                    <div
                      key={ev.id}
                      className="timeline-marker"
                      style={{ left: `${pct}%` }}
                      onClick={() => onJump?.(ev)}
                      onMouseEnter={() => setHoveredEvent(ev)}
                      onMouseLeave={() => setHoveredEvent(null)}
                      role="button"
                      aria-label={`Risk event at ${ev.ts}: ${ev.desc}`}
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && onJump?.(ev)}
                    >
                      <div className={`marker-dot ${ev.severity}`} />
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {/* Tooltip for hovered event */}
      {hoveredEvent && (
        <div style={{
          marginTop: 6,
          padding: '6px 12px',
          background: 'var(--elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm)',
          fontSize: '0.72rem',
          color: 'var(--text-2)',
        }}>
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{hoveredEvent.ts}</span>
          {' — '}{hoveredEvent.desc}
        </div>
      )}
    </div>
  );
}

// ── Main Command Center ──────────────────────────────────────────
export default function CommandCenter() {
  const {
    telemetry, riskEvents,
    integrityScore, ghostViewEnabled, toggleGhostView,
    sessionSeconds,
    hitlEvent, clearHitlEvent,
    agentStatuses, sessionId,
    accommodationRequested,
    relaxedProctoringEnabled,
    setRelaxedProctoringEnabled
  } = useAegisStore();

  const handleJump = (event) => {
    // Seek timeline playhead and video player (US-03)
    useAegisStore.setState({ sessionSeconds: event.sessionSec });
    console.log('Jumped video player to:', event.sessionSec);
  };

  const summaryScore = integrityScore;

  // Mock transcript data
  const transcript = [
    { ts: '00:00', speaker: 'AI', text: 'Hello! I\'m Aria. Can you walk me through a recent challenging project?' },
    { ts: '00:18', speaker: 'Candidate', text: 'Sure! I led a migration of a monolith to microservices at my last company...' },
    { ts: '01:05', speaker: 'AI', text: 'What was the hardest technical challenge in that migration?', flagged: false },
    { ts: '01:22', speaker: 'Candidate', text: 'Data consistency across services was the biggest challenge. We used Saga pattern...', flagged: false },
  ];

  return (
    <div className="command-center" role="main" aria-label="Recruiter command center">

      {/* HITL Modal */}
      <HITLPanel 
        event={hitlEvent} 
        onDecision={(decision) => {
          console.log("Recruiter decision:", decision);
          clearHitlEvent();
          // In production: send decision via recruiter WebSocket
        }}
        onDismiss={clearHitlEvent}
      />

      {/* ── Video Player ── */}
      <div className="video-player-panel">
        <VideoWithGhost ghostEnabled={ghostViewEnabled} telemetry={telemetry} />

        {/* Ghost View toggle */}
        <button
          className={`ghost-toggle ${ghostViewEnabled ? 'active' : ''}`}
          onClick={toggleGhostView}
          aria-pressed={ghostViewEnabled}
          aria-label="Toggle Ghost CV view"
          id="ghost-view-btn"
        >
          {ghostViewEnabled ? '👁 GHOST VIEW ON' : '👁 GHOST VIEW OFF'}
        </button>

        {/* Video controls strip */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
          padding: '20px 16px 12px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.75rem' }}>⏮</button>
          <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.75rem' }}>⏸</button>
          <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.75rem' }}>⏭</button>
          <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.2)', borderRadius: 4, cursor: 'pointer' }}>
            <div style={{ width: '30%', height: '100%', background: 'var(--aegis-cyan)', borderRadius: 4 }} />
          </div>
          <span style={{ fontSize: '0.72rem', fontFamily: 'var(--mono)', color: 'var(--text-2)' }}>
            {`${String(Math.floor(sessionSeconds / 60)).padStart(2,'0')}:${String(sessionSeconds % 60).padStart(2,'0')}`}
          </span>
          <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.75rem' }}>⬇ Export</button>
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="recruiter-right" role="complementary" aria-label="Integrity analysis panel">

        {/* ── Tab Navigation for right panel ─────────────── */}
        {(() => {
          const [rightTab, setRightTab] = useState('biometrics');
          const tabs = [
            { id: 'biometrics', label: '🧬 Bio' },
            { id: 'fraud',      label: '🔴 Fraud' },
            { id: 'gaze',       label: '👁 Gaze' },
            { id: 'extensions', label: '🛡 Extensions' },
            { id: 'timeline',   label: '📊 Timeline' },
            { id: 'trust',      label: '⚡ Trust' },
          ];
          return (
            <>
              <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
                {tabs.map(t => (
                  <button key={t.id}
                    onClick={() => setRightTab(t.id)}
                    style={{
                      padding: '4px 10px', borderRadius: 20,
                      border: `1px solid ${rightTab === t.id ? 'var(--aegis-blue)' : 'var(--border)'}`,
                      background: rightTab === t.id ? 'rgba(59,130,246,0.12)' : 'transparent',
                      color: rightTab === t.id ? 'var(--aegis-blue)' : 'var(--text-3)',
                      fontSize: '0.62rem', cursor: 'pointer', fontFamily: 'var(--font)',
                    }}
                  >{t.label}</button>
                ))}
              </div>

              {rightTab === 'biometrics' && (
                <>
                  {/* Accessibility Accommodation Status (US-05) */}
                  {accommodationRequested && (
                    <div style={{
                      padding: '10px 14px',
                      background: 'rgba(255, 159, 28, 0.08)',
                      border: '1px solid rgba(255, 159, 28, 0.25)',
                      borderRadius: 'var(--r-md)',
                      fontSize: '0.72rem',
                      color: 'var(--aegis-amber)',
                      marginBottom: '12px',
                      lineHeight: '1.4'
                    }}>
                      ♿ Candidate declared visual/motor disability and requested proctoring accommodations.
                    </div>
                  )}

                  {/* Relaxed Proctoring Configuration Switch (US-05) */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-md)',
                    marginBottom: '14px'
                  }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: '600', color: 'var(--text-2)' }}>
                      ♿ Relaxed Proctoring
                    </span>
                    <button
                      onClick={() => setRelaxedProctoringEnabled(!relaxedProctoringEnabled)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: '20px',
                        border: '1px solid var(--border)',
                        background: relaxedProctoringEnabled ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                        color: relaxedProctoringEnabled ? 'var(--aegis-green)' : 'var(--text-3)',
                        fontSize: '0.62rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        fontFamily: 'var(--font)',
                        transition: 'all 0.2s'
                      }}
                    >
                      {relaxedProctoringEnabled ? 'ON (BIOMETRICS BYPASSED)' : 'OFF'}
                    </button>
                  </div>

                  <AgentStatusPanel statuses={agentStatuses} />
                  <IntegrityGauge score={summaryScore} />
                  <div style={{ height: 180, borderRadius: 'var(--r-lg)', overflow: 'hidden', border: '1px solid var(--border-blue)', flexShrink: 0, background: 'var(--surface)' }}>
                    <Canvas camera={{ position: [0, 0, 6], fov: 50 }}>
                      <CyberAvatar pose={telemetry.pose} anomaly={telemetry.gaze_anomaly} />
                      <OrbitControls enableZoom={false} enablePan={false} />
                    </Canvas>
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '0.6rem', color: 'var(--text-3)', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: -8 }}>Digital Twin · Zero-Bias Mask Active</div>
                  <div className="metrics-grid">
                    {[
                      { label: 'Gaze Status', val: telemetry.gaze_anomaly ? '⚠ Anomaly' : '✓ Stable', cls: telemetry.gaze_anomaly ? 'alert' : 'safe', flagged: telemetry.gaze_anomaly },
                      { label: 'Hands', val: `${telemetry.hands_visible||0} in frame`, cls: (telemetry.hands_visible||0) > 1 ? 'warn' : 'safe', flagged: (telemetry.hands_visible||0) > 1 },
                      { label: 'Risk Events', val: riskEvents.length, cls: riskEvents.length > 5 ? 'alert' : riskEvents.length > 2 ? 'warn' : 'safe', flagged: false },
                      { label: 'Integrity', val: `${summaryScore}%`, cls: summaryScore >= 80 ? 'safe' : summaryScore >= 50 ? 'warn' : 'alert', flagged: summaryScore < 50 },
                    ].map(m => (
                      <div key={m.label} className={`r-metric ${m.flagged ? 'flagged' : ''}`}>
                        <div className="r-metric-label">{m.label}</div>
                        <div className={`r-metric-val ${m.cls}`}>{m.val}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 12 }}>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>Head Pose (Euler) — Paper §4.5</div>
                    <div className="euler-row">
                      {[['Pitch', telemetry.pose?.pitch], ['Yaw', telemetry.pose?.yaw], ['Roll', telemetry.pose?.roll]].map(([axis, val]) => (
                        <div key={axis} className="euler-chip">
                          <div className="euler-axis">{axis}</div>
                          <div className="euler-val">{Math.round(val || 0)}°</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="risk-section">
                    <div className="risk-header"><div className="risk-title">⚡ Risk Event Log</div><div className="risk-count">{riskEvents.length} events</div></div>
                    <div className="risk-list">
                      {riskEvents.length === 0 && <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', textAlign: 'center', padding: '12px 0' }}>No anomalies detected.</div>}
                      {[...riskEvents].reverse().map(ev => (
                        <div key={ev.id} className={`risk-event ${ev.severity}`}>
                          <div><div className="risk-ts">{ev.ts}</div></div>
                          <div><div className="risk-desc">{ev.desc}</div><div className={`risk-severity ${ev.severity}`}>{ev.severity}</div></div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--text-3)' }}>AI Transcript</div>
                    <div className="transcript-section">
                      {transcript.map((line, i) => (<div key={i} className="transcript-line"><span className="ts">{line.ts}</span><span className="ai-tag">{line.speaker}:</span><span>{line.text}</span></div>))}
                    </div>
                  </div>
                  <ArtifactViewer sessionId={sessionId} />
                </>
              )}

              {rightTab === 'fraud' && <FraudScorePanel />}
              {rightTab === 'gaze'  && <GazeHeatmap />}
              {rightTab === 'extensions' && <ExtensionThreatCatalog />}
              {rightTab === 'timeline' && <BehaviorTimeline />}
              {rightTab === 'trust' && <MultiModalTrustScore />}
            </>
          );
        })()}
      </div>

      {/* ── Timeline ── */}
      <ForensicTimeline
        events={riskEvents}
        sessionSeconds={sessionSeconds}
        onJump={handleJump}
      />
    </div>
  );
}
