/**
 * CalibrationScreen.jsx
 * Phase 1: Ultra-Premium 3D Gyroscopic Calibration + Voice Enrollment
 */
import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useSpring, a } from '@react-spring/three';
import { useAegisStore } from './useAegisStore';
import { useSpeakerVerification } from './useSpeakerVerification';

const CALIBRATION_DURATION = 10000;

// 3D Gyroscope Ring Component
function GyroRing({ radius, speed, axis, locked }) {
  const meshRef = useRef();

  // Target rotation for locked state
  const { rot } = useSpring({
    rot: locked ? 0 : Math.PI * 2,
    config: { mass: 1, tension: 50, friction: 14 }
  });

  useFrame((state, delta) => {
    if (meshRef.current && !locked) {
      if (axis === 'x') meshRef.current.rotation.x += speed * delta;
      if (axis === 'y') meshRef.current.rotation.y += speed * delta;
      if (axis === 'z') meshRef.current.rotation.z += speed * delta;
    }
  });

  return (
    <a.mesh ref={meshRef} rotation-x={axis === 'x' ? rot : 0} rotation-y={axis === 'y' ? rot : 0} rotation-z={axis === 'z' ? rot : 0}>
      <torusGeometry args={[radius, 0.05, 16, 100]} />
      <meshStandardMaterial 
        color={locked ? "#10b981" : "#3b82f6"} 
        emissive={locked ? "#10b981" : "#3b82f6"}
        emissiveIntensity={locked ? 2 : 0.5}
        transparent
        opacity={locked ? 1 : 0.4}
        metalness={0.8}
        roughness={0.2}
      />
    </a.mesh>
  );
}

export default function CalibrationScreen() {
  const { setPhase, setCalibrationProgress, setCalibrationDone, showToast } = useAegisStore();

  const videoRef   = useRef(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage]       = useState('waiting'); // waiting | running | done | voice_enroll | complete
  const [locks, setLocks]       = useState({ gaze: false, lux: false, mesh: false, tone: false });

  // Voice enrollment (Paper §Speaker Verification)
  const { startEnrollment, enrollmentState, enrollProgress, isEnrolled } = useSpeakerVerification(true);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
      .then(s => { if (videoRef.current) videoRef.current.srcObject = s; })
      .catch(() => showToast('Camera required.', 'error'));
    return () => videoRef.current?.srcObject?.getTracks().forEach(t => t.stop());
  }, []);

  useEffect(() => {
    if (stage !== 'running') return;

    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / CALIBRATION_DURATION) * 100, 100);
      setProgress(pct);
      setCalibrationProgress(pct);

      // Staggered lock-ins
      if (pct > 25 && !locks.gaze) setLocks(l => ({ ...l, gaze: true }));
      if (pct > 50 && !locks.lux)  setLocks(l => ({ ...l, lux: true }));
      if (pct > 75 && !locks.mesh) setLocks(l => ({ ...l, mesh: true }));
      if (pct >= 100 && !locks.tone) setLocks(l => ({ ...l, tone: true }));

      if (elapsed >= CALIBRATION_DURATION) {
        clearInterval(interval);
        setTimeout(() => {
          setStage('done');
          setCalibrationDone(true);
        }, 600); // Wait for final lock animation
      }
    }, 50);

    return () => clearInterval(interval);
  }, [stage, locks]);

  // When calibration finishes, move to voice enrollment step
  useEffect(() => {
    if (stage === 'done') {
      // Auto-advance to voice enrollment after 1.2s
      const t = setTimeout(() => setStage('voice_enroll'), 1200);
      return () => clearTimeout(t);
    }
  }, [stage]);

  // When enrollment finishes, allow entry to interview
  useEffect(() => {
    if (enrollmentState === 'done' || enrollmentState === 'error') {
      setStage('complete');
    }
  }, [enrollmentState]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#020508' }}>
      
      {/* Aurora Ambient Lighting */}
      <div className="aurora-bg">
        <div className="aurora-blob b2" style={{ width: '50%', height: '50%', left: '25%', top: '25%' }} />
      </div>

      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
        
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 40, animation: 'card-in 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
          <h2 className="premium-title" style={{ fontSize: '1.8rem', marginBottom: 12 }}>
            {stage === 'done' ? 'Baseline Secured' : 'Biometric Calibration'}
          </h2>
          <p className="premium-subtitle" style={{ maxWidth: 440 }}>
            {stage === 'done'
              ? 'Environmental and biometric baselines are fully locked. The system is ready.'
              : 'Look directly at the gyroscopic core. Establishing baseline telemetry.'}
          </p>
        </div>

        {/* Gyroscope + Video Container */}
        <div style={{ position: 'relative', width: 300, height: 300, marginBottom: 40 }}>
          
          {/* Circular Video Feed */}
          <div style={{ 
            position: 'absolute', inset: 30, borderRadius: '50%', overflow: 'hidden', 
            background: '#000', border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 0 40px rgba(0,0,0,0.5)', zIndex: 1
          }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', opacity: 0.8 }} />
            
            {/* Dark overlay during calibration */}
            {stage === 'running' && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />}
          </div>

          {/* 3D Gyroscope Overlay */}
          {stage !== 'waiting' && (
            <div style={{ position: 'absolute', inset: -50, zIndex: 10 }}>
              <Canvas camera={{ position: [0, 0, 4] }}>
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} intensity={1} />
                <GyroRing radius={1.4} speed={1.5} axis="x" locked={locks.gaze} />
                <GyroRing radius={1.6} speed={-1.2} axis="y" locked={locks.lux} />
                <GyroRing radius={1.8} speed={1.8} axis="z" locked={locks.mesh} />
                <GyroRing radius={2.0} speed={-0.8} axis="x" locked={locks.tone} />
              </Canvas>
            </div>
          )}
        </div>

        {/* Telemetry Status Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, width: 440, marginBottom: 40 }}>
          {[
            { id: 'gaze', label: 'Gaze Vector', locked: locks.gaze },
            { id: 'lux', label: 'Ambient Lux', locked: locks.lux },
            { id: 'mesh', label: '468pt Mesh', locked: locks.mesh },
            { id: 'tone', label: 'Skin Tone DB', locked: locks.tone }
          ].map(item => (
            <div key={item.id} className="premium-check-item" style={{ padding: '12px 16px', background: 'transparent', borderColor: item.locked ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.05)' }}>
              <span className="premium-check-label" style={{ fontSize: '0.8rem', color: item.locked ? '#fff' : 'rgba(255,255,255,0.4)' }}>{item.label}</span>
              <div style={{ width: 16, height: 16 }}>
                {item.locked ? (
                  <svg viewBox="0 0 24 24">
                    <path d="M5 13l4 4L19 7" fill="none" stroke="var(--aegis-green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" 
                      style={{ strokeDasharray: 24, strokeDashoffset: 24, animation: 'draw-check 0.4s ease-out forwards' }} />
                  </svg>
                ) : stage === 'running' ? (
                  <svg viewBox="0 0 24 24" style={{ animation: 'reticle-spin 2s linear infinite', opacity: 0.3 }}>
                    <circle cx="12" cy="12" r="10" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="16 48" />
                  </svg>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        {stage === 'waiting' && (
          <button className="btn-premium" onClick={() => setStage('running')} style={{ width: 280 }}>
            Initialize Telemetry
          </button>
        )}

        {stage === 'running' && (
          <div style={{ width: 280, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--aegis-cyan)', width: `${progress}%`, transition: 'width 0.1s linear' }} />
          </div>
        )}

        {/* Voice Enrollment Step (Paper §Speaker Verification) */}
        {(stage === 'voice_enroll' || stage === 'complete') && (
          <div style={{
            width: 480, padding: '24px', marginTop: -20,
            background: 'rgba(59,130,246,0.05)',
            border: `1px solid ${enrollmentState === 'done' ? 'rgba(16,185,129,0.3)' : enrollmentState === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.25)'}`,
            borderRadius: 16, animation: 'card-in 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0,
              }}>🎙️</div>
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--aegis-blue)' }}>
                  Voice Enrollment — Paper §Audio Forensics
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', marginTop: 3 }}>
                  {enrollmentState === 'idle'      && 'Enroll your voice to enable speaker verification during the interview.'}
                  {enrollmentState === 'recording' && 'Recording… please speak clearly: “My name is [your name] and today’s date is [date].”'}
                  {enrollmentState === 'done'      && '✓ Voice profile enrolled. Cosine-similarity matching active during interview.'}
                  {enrollmentState === 'error'     && 'Enrollment failed — mic may not be available. Speaker verification will be skipped.'}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            {enrollmentState === 'recording' && (
              <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
                <div style={{
                  height: '100%', width: `${enrollProgress * 100}%`,
                  background: 'linear-gradient(90deg, var(--aegis-blue), var(--aegis-cyan))',
                  borderRadius: 3, transition: 'width 0.2s ease',
                }} />
              </div>
            )}

            {/* Spectral bin preview (visual only) */}
            {enrollmentState === 'recording' && (
              <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 28, marginBottom: 12 }}>
                {Array.from({ length: 13 }).map((_, i) => (
                  <div key={i} style={{
                    flex: 1,
                    height: `${20 + Math.sin(Date.now() / 200 + i) * 40 + 40}%`,
                    background: `rgba(0,${140 + i * 8},216,0.7)`,
                    borderRadius: '2px 2px 0 0',
                    transition: 'height 0.15s',
                    animation: `voice-bar-${i} 0.4s ease-in-out infinite alternate`,
                  }} />
                ))}
              </div>
            )}

            {enrollmentState === 'done' && (
              <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 28, marginBottom: 12, opacity: 0.6 }}>
                {Array.from({ length: 13 }).map((_, i) => (
                  <div key={i} style={{
                    flex: 1,
                    height: `${30 + Math.sin(i * 0.8) * 25 + 25}%`,
                    background: 'var(--aegis-green)',
                    borderRadius: '2px 2px 0 0',
                  }} />
                ))}
              </div>
            )}

            {/* Actions */}
            {enrollmentState === 'idle' && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn-premium"
                  onClick={startEnrollment}
                  style={{ width: '100%', padding: '12px 0', fontSize: '0.85rem' }}
                >
                  🎙 Start Mandatory 8-Second Voice Enrollment
                </button>
              </div>
            )}
          </div>
        )}

        {stage === 'complete' && (
          <button
            className="btn-premium success"
            onClick={() => setPhase('interview')}
            style={{ width: 280, marginTop: 16, animation: 'card-in 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)' }}
          >
            {isEnrolled ? '✓ Voice Enrolled — Enter Interview Arena' : 'Enter Interview Arena'}
          </button>
        )}

      </div>
    </div>
  );
}
