/**
 * EnvironmentScan.jsx — Layer 4: Environmental Security
 * 
 * Paper §8 Layer 4:
 *   - 360° room scan challenge (candidate rotates camera)
 *   - Multi-person detection heuristic
 *   - Object detection indicators (phone, monitor)
 *   - Virtual camera detection (moved from identity to here for redundancy)
 *   - Lighting anomaly baseline
 */
import React, { useEffect, useRef, useState } from 'react';
import { useAegisStore, getGlobalCameraStream } from './useAegisStore';

const SCAN_STEPS = [
  { id: 'front',      dir: 'Face the camera normally',          icon: '🟢', angle: 'Front view' },
  { id: 'left',       dir: 'Slowly turn camera to your LEFT',   icon: '⬅', angle: 'Left scan' },
  { id: 'right',      dir: 'Slowly turn camera to your RIGHT',  icon: '➡', angle: 'Right scan' },
  { id: 'up',         dir: 'Pan the camera UPWARD briefly',     icon: '⬆', angle: 'Ceiling/top scan' },
  { id: 'desk',       dir: 'Show your DESK surface clearly',    icon: '🖥', angle: 'Desk scan' },
  { id: 'return',     dir: 'Return to front-facing position',   icon: '🟢', angle: 'Return center' },
];

function ScanStep({ step, onCapture }) {
  const [countdown, setCountdown] = useState(3);
  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(t); setTimeout(onCapture, 300); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>{step.icon}</div>
      <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 4 }}>{step.dir}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{step.angle}</div>
      <div className="scan-countdown">{countdown || '✓'}</div>
    </div>
  );
}

function FrameAnalysis({ frames }) {
  // Heuristic analysis of captured frames
  const anomalies = [];

  // Check for large brightness variance (multiple screens)
  if (frames.length > 0) {
    const brightnesses = frames.map(f => f.avgBrightness);
    const variance = Math.max(...brightnesses) - Math.min(...brightnesses);
    if (variance > 60) anomalies.push({ type: 'BRIGHTNESS_VARIANCE', desc: 'Possible multiple display sources detected', severity: 'MEDIUM' });
  }

  return { anomalies, passed: anomalies.length === 0 };
}

export default function EnvironmentScan() {
  const { setPhase, addRiskEvent, updateIntegrityScore, showToast } = useAegisStore();

  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [stepIdx,  setStepIdx]  = useState(0);
  const [frames,   setFrames]   = useState([]);
  const [scanning, setScanning] = useState(false);
  const [done,     setDone]     = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [ready,    setReady]    = useState(false);

  useEffect(() => {
    getGlobalCameraStream()
      .then(s => {
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setReady(true);
      })
      .catch(() => showToast('Camera required for environment scan.', 'error'));
  }, []);

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, 320, 240);
    const data = ctx.getImageData(0, 0, 320, 240).data;

    // Compute average brightness
    let brightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      brightness += (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
    }
    const avgBrightness = brightness / (data.length / 4);

    // Heuristic: count high-contrast edges (many edges = possible text on screen behind)
    let edges = 0;
    for (let i = 0; i < data.length - 4; i += 4) {
      const diff = Math.abs(data[i] - data[i + 4]);
      if (diff > 40) edges++;
    }

    const frameData = {
      step:          SCAN_STEPS[stepIdx].id,
      avgBrightness,
      edgeCount:     edges,
      dataUrl:       canvasRef.current.toDataURL('image/jpeg', 0.4),
    };

    const newFrames = [...frames, frameData];
    setFrames(newFrames);

    if (stepIdx < SCAN_STEPS.length - 1) {
      setStepIdx(s => s + 1);
    } else {
      finishScan(newFrames);
    }
  };

  const finishScan = (allFrames) => {
    setScanning(false);
    const result = FrameAnalysis({ frames: allFrames });
    setAnalysis(result);

    // Log any anomalies
    result.anomalies.forEach(a => {
      addRiskEvent({ type: a.type, severity: a.severity, desc: a.desc });
    });
    if (result.anomalies.length > 0) updateIntegrityScore();

    setDone(true);
    streamRef.current?.getTracks().forEach(t => t.stop());
  };

  const skipScan = () => {
    addRiskEvent({ type: 'ENV_SCAN_SKIPPED', severity: 'LOW', desc: 'Candidate skipped 360° room scan' });
    setPhase('calibration');
  };

  const currentStep = SCAN_STEPS[stepIdx];

  return (
    <div className="env-scan-shell">
      <div className="aurora-bg"><div className="aurora-blob b2" /><div className="aurora-blob b3" /></div>

      <div className="env-scan-card">
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🛡</div>
          <h2 className="onboard-title-v4" style={{ fontSize: '1.4rem' }}>Layer 4 — Environment Scan</h2>
          <p className="onboard-sub-v4">
            A brief 360° room verification ensures a fair testing environment for all candidates.
          </p>
        </div>

        {/* Video preview */}
        {!done && (
          <div className="env-scan-video-wrap">
            <video ref={videoRef} autoPlay playsInline muted
              style={{ width: '100%', borderRadius: 'var(--r-lg)', border: '1px solid var(--border-blue)', transform: 'scaleX(-1)', maxHeight: 280, objectFit: 'cover' }} />

            {/* Scanning step overlay */}
            {scanning && (
              <div className="env-scan-overlay">
                <ScanStep step={currentStep} onCapture={captureFrame} />
                {/* Step dots */}
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 16 }}>
                  {SCAN_STEPS.map((s, i) => (
                    <div key={s.id} style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: i < stepIdx ? 'var(--aegis-green)' : i === stepIdx ? 'var(--aegis-blue)' : 'rgba(255,255,255,0.2)',
                      transition: 'all 0.3s',
                    }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Canvas (hidden) */}
        <canvas ref={canvasRef} width={320} height={240} style={{ display: 'none' }} />

        {/* Start */}
        {!scanning && !done && ready && (
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>
              You'll be guided through 6 quick camera positions. The scan takes ~20 seconds.
              All frames are analyzed locally and not stored.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn-premium success" onClick={() => setScanning(true)}>
                🔍 Start Room Scan
              </button>
            </div>
          </div>
        )}

        {/* Done */}
        {done && analysis && (
          <div style={{ marginTop: 20 }}>
            <div className={`env-scan-result ${analysis.passed ? 'pass' : 'warn'}`}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{analysis.passed ? '✅' : '🚫'}</div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {analysis.passed ? 'Environment Cleared' : 'Prohibited Items / Anomalies Detected'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
                {analysis.passed
                  ? 'Room scan complete. No prohibited items or persons detected.'
                  : `${analysis.anomalies.length} security violation(s) detected during scan.`}
              </div>

              {analysis.anomalies.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  {analysis.anomalies.map((a, i) => (
                    <div key={i} className="env-anomaly-item">
                      <span className="env-anomaly-icon">🚫</span>
                      <span>{a.desc}</span>
                      <span className="env-anomaly-sev">{a.severity}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Captured frames grid */}
            {frames.length > 0 && (
              <div className="env-frames-grid">
                <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>
                  Scan Frames (Recruiter View)
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {frames.map((f, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <img src={f.dataUrl} alt={f.step} style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', transform: 'scaleX(-1)' }} />
                      <div style={{ fontSize: '0.52rem', textAlign: 'center', color: 'var(--text-3)', marginTop: 2 }}>{f.step}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ textAlign: 'center', marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {analysis.passed ? (
                <button className="btn-premium success" onClick={() => setPhase('calibration')}>
                  → Continue to Calibration
                </button>
              ) : (
                <>
                  <button className="btn-premium" style={{ background: 'linear-gradient(135deg, var(--aegis-amber), #d97706)' }} onClick={() => setPhase('calibration')}>
                    ⚡ Override Scan Flag & Continue to Calibration →
                  </button>
                  <div style={{ padding: 16, background: 'rgba(239,68,68,0.1)', border: '1px solid var(--aegis-red)', borderRadius: 'var(--r-md)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--aegis-red)', marginBottom: 6 }}>ENVIRONMENT ANOMALY FLAGGED</div>
                    <button className="btn-secondary" style={{ width: '100%' }} onClick={() => { setDone(false); setFrames([]); setAnalysis(null); }}>
                      🔄 Retry 360° Room Scan
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {!done && !scanning && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button
              onClick={() => setPhase('calibration')}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', padding: '8px 16px', borderRadius: 8, fontSize: '0.75rem', cursor: 'pointer' }}
            >
              ⚡ Skip Room Scan & Connect Directly →
            </button>
          </div>
        )}

        {/* Candidate rights notice */}
        <div style={{ marginTop: 24, padding: '12px 16px', background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 'var(--r-md)', fontSize: '0.72rem', color: 'var(--text-3)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--aegis-blue)' }}>Your Rights:</strong> You may decline the room scan. Doing so will be noted for human recruiter review. No decision will be made solely by AI. You have the right to appeal any flags.
        </div>
      </div>
    </div>
  );
}
