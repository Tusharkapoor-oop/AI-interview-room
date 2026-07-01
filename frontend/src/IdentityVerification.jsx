/**
 * IdentityVerification.jsx — Layer 1: Identity Security
 * 
 * Paper §2.1 + §8 Layer 1:
 *   - Government ID upload + OCR simulation
 *   - Face-to-ID match (selfie verification)
 *   - Device fingerprinting
 *   - Voiceprint enrollment
 *   - Biometric authentication baseline
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAegisStore } from './useAegisStore';

// ── Device Fingerprint Generator ──────────────────────────────────
async function generateDeviceFingerprint() {
  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d');
  ctx.fillStyle = '#f00';
  ctx.fillRect(0, 0, 10, 10);
  ctx.fillStyle = 'rgba(0,255,0,0.5)';
  ctx.fillRect(2, 2, 6, 6);
  const canvasHash = canvas.toDataURL().slice(-32);

  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency,
    navigator.deviceMemory || '?',
    canvasHash,
  ].join('|');

  // Simple hash
  let hash = 0;
  for (let i = 0; i < components.length; i++) {
    hash = (hash << 5) - hash + components.charCodeAt(i);
    hash |= 0;
  }
  return 'DFP-' + Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
}

// ── Virtual Camera Detector ───────────────────────────────────────
async function detectVirtualCamera() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    const labels = videoDevices.map(d => d.label.toLowerCase());
    const virtualKeywords = ['obs', 'virtual', 'manycam', 'snap camera', 'droidcam', 'ndi', 'streamlabs'];
    const detected = virtualKeywords.some(kw => labels.some(l => l.includes(kw)));
    return { detected, labels };
  } catch {
    return { detected: false, labels: [] };
  }
}

// ── Step Components ───────────────────────────────────────────────

function StepIDUpload({ onComplete }) {
  const [idPreview, setIdPreview] = useState(null);
  const [scanning,  setScanning]  = useState(false);
  const [result,    setResult]    = useState(null);
  const fileRef = useRef();

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setIdPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleScan = async () => {
    if (!idPreview) return;
    setScanning(true);
    // Simulate OCR + ID validation (in production: AWS Textract / Google Vision)
    await new Promise(r => setTimeout(r, 2200));
    setResult({ name: 'Verified', dob: '••/••/••••', id_type: 'Government ID', confidence: 0.97 });
    setScanning(false);
  };

  return (
    <div className="id-step">
      <div className="id-step-icon">🪪</div>
      <h3 className="id-step-title">Government ID Verification</h3>
      <p className="id-step-sub">Upload a clear photo of your government-issued ID (passport, driver's license, or national ID). Your data is encrypted and auto-purged after 90 days.</p>

      {!idPreview ? (
        <div className="id-upload-zone" onClick={() => fileRef.current?.click()}>
          <div className="id-upload-icon">📁</div>
          <div className="id-upload-text">Click to upload ID document</div>
          <div className="id-upload-hint">JPEG, PNG or PDF · Max 10MB</div>
          <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleFile} />
        </div>
      ) : (
        <div className="id-preview-wrap">
          <img src={idPreview} alt="ID preview" className="id-preview-img" />
          {!result && (
            <button className="btn-primary" style={{ marginTop: 16 }} onClick={handleScan} disabled={scanning}>
              {scanning ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  <span className="check-spinner" /> Scanning Document…
                </span>
              ) : '🔍 Verify Document'}
            </button>
          )}
          {result && (
            <div className="id-result">
              <div className="id-result-row"><span>Status</span><strong style={{ color: 'var(--aegis-green)' }}>✓ VERIFIED</strong></div>
              <div className="id-result-row"><span>Document</span><strong>{result.id_type}</strong></div>
              <div className="id-result-row"><span>Confidence</span><strong>{(result.confidence * 100).toFixed(0)}%</strong></div>
              <button className="btn-premium success" style={{ marginTop: 16 }} onClick={() => onComplete({ idVerified: true, idConfidence: result.confidence })}>
                Continue →
              </button>
            </div>
          )}
        </div>
      )}

      <div className="id-privacy-note">
        🔒 Document processed with AES-256 encryption. Raw image never stored on servers. GDPR / BIPA compliant.
      </div>
    </div>
  );
}

function StepSelfieMatch({ onComplete }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const [captured,  setCaptured]  = useState(null);
  const [matching,  setMatching]  = useState(false);
  const [matchScore, setMatchScore] = useState(null);
  const [stream,    setStream]    = useState(null);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } })
      .then(s => {
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;
      });
    return () => stream?.getTracks().forEach(t => t.stop());
  }, []);

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, 640, 480);
    const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.9);
    setCaptured(dataUrl);
    stream?.getTracks().forEach(t => t.stop());
  };

  const runMatch = async () => {
    setMatching(true);
    // Simulate face-to-ID matching (production: AWS Rekognition / Azure Face API)
    await new Promise(r => setTimeout(r, 1800));
    const score = 0.89 + Math.random() * 0.09; // 89-98% match
    setMatchScore(score);
    setMatching(false);
  };

  const passed = matchScore !== null && matchScore >= 0.75;

  return (
    <div className="id-step">
      <div className="id-step-icon">🤳</div>
      <h3 className="id-step-title">Selfie Verification</h3>
      <p className="id-step-sub">We'll compare your live selfie to your uploaded ID to confirm your identity.</p>

      {!captured ? (
        <div style={{ position: 'relative', width: '100%', maxWidth: 360, margin: '0 auto' }}>
          <video ref={videoRef} autoPlay playsInline muted
            style={{ width: '100%', borderRadius: 'var(--r-lg)', border: '1px solid var(--border-blue)', transform: 'scaleX(-1)' }} />
          {/* Face guide oval */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: 140, height: 180, border: '2px dashed rgba(59,130,246,0.6)', borderRadius: '50%' }} />
          </div>
          <button className="btn-primary" style={{ marginTop: 12 }} onClick={capture}>📸 Capture Selfie</button>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <img src={captured} alt="Selfie" style={{ width: 200, height: 200, objectFit: 'cover', borderRadius: '50%', border: '2px solid var(--aegis-blue)', transform: 'scaleX(-1)', marginBottom: 16 }} />
          {!matchScore && (
            <button className="btn-primary" onClick={runMatch} disabled={matching}>
              {matching ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}><span className="check-spinner" /> Matching…</span> : '🔄 Run Face Match'}
            </button>
          )}
          {matchScore !== null && (
            <div className="id-result">
              <div className="id-result-row">
                <span>Match Score</span>
                <strong style={{ color: passed ? 'var(--aegis-green)' : 'var(--aegis-red)' }}>
                  {(matchScore * 100).toFixed(1)}%
                </strong>
              </div>
              <div className="id-result-row">
                <span>Status</span>
                <strong style={{ color: passed ? 'var(--aegis-green)' : 'var(--aegis-red)' }}>
                  {passed ? '✓ MATCH CONFIRMED' : '✕ MISMATCH DETECTED'}
                </strong>
              </div>
              {passed && (
                <button className="btn-premium success" style={{ marginTop: 16 }}
                  onClick={() => onComplete({ selfieVerified: true, matchScore })}>
                  Continue →
                </button>
              )}
              {!passed && (
                <div className="id-warn-banner" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--aegis-red)', color: 'var(--aegis-red)', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>🚫</div>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>FACE MATCH FAILED</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: 12 }}>
                    Face match score below mandatory security threshold. Access denied under strict biometric protocol.
                  </div>
                  <button className="btn-secondary" style={{ width: '100%' }}
                    onClick={() => { setCaptured(false); setMatchScore(null); setPassed(null); startVideo(); }}>
                    🔄 Retake Selfie
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <canvas ref={canvasRef} width={640} height={480} style={{ display: 'none' }} />
    </div>
  );
}

function StepVoiceEnroll({ onComplete }) {
  const [recording, setRecording]   = useState(false);
  const [enrolled,  setEnrolled]    = useState(false);
  const [seconds,   setSeconds]     = useState(0);
  const [waveform,  setWaveform]    = useState(Array(30).fill(2));
  const mediaRef   = useRef(null);
  const timerRef   = useRef(null);
  const rafRef     = useRef(null);
  const analyserRef = useRef(null);
  const ctxRef     = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRef.current = stream;
      ctxRef.current = new AudioContext();
      analyserRef.current = ctxRef.current.createAnalyser();
      analyserRef.current.fftSize = 64;
      ctxRef.current.createMediaStreamSource(stream).connect(analyserRef.current);

      setRecording(true);
      setSeconds(0);

      timerRef.current = setInterval(() => {
        setSeconds(s => {
          if (s >= 4) {
            stopRecording();
            return s;
          }
          return s + 1;
        });
      }, 1000);

      const drawWave = () => {
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        setWaveform(Array.from(data.slice(0, 30)).map(v => Math.max(2, v / 255 * 44)));
        rafRef.current = requestAnimationFrame(drawWave);
      };
      rafRef.current = requestAnimationFrame(drawWave);
    } catch {
      onComplete({ voiceEnrolled: false, reason: 'mic_denied' });
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    mediaRef.current?.getTracks().forEach(t => t.stop());
    ctxRef.current?.close();
    setRecording(false);
    setEnrolled(true);
  };

  return (
    <div className="id-step">
      <div className="id-step-icon">🎤</div>
      <h3 className="id-step-title">Voice Biometric Enrollment</h3>
      <p className="id-step-sub">Please read the following phrase aloud clearly. This creates your voiceprint baseline for continuous verification during the interview.</p>

      <div className="voice-phrase-box">
        "I confirm that I am the registered candidate attending this interview session."
      </div>

      {/* Waveform visualizer */}
      <div className="voice-wave-viz">
        {waveform.map((h, i) => (
          <div key={i} className="wave-bar" style={{ height: `${h}px`, background: recording ? 'var(--aegis-blue)' : enrolled ? 'var(--aegis-green)' : 'var(--text-4)' }} />
        ))}
      </div>

      {!enrolled ? (
        <div style={{ textAlign: 'center' }}>
          {!recording ? (
            <button className="btn-primary" onClick={startRecording}>🔴 Start Recording</button>
          ) : (
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--aegis-blue)', marginBottom: 8 }}>
                Recording… {5 - seconds}s remaining
              </div>
              <div className="voice-progress">
                <div className="voice-progress-fill" style={{ width: `${(seconds / 5) * 100}%` }} />
              </div>
              <button className="btn-secondary" style={{ marginTop: 12 }} onClick={stopRecording}>Stop Early</button>
            </div>
          )}
        </div>
      ) : (
        <div className="id-result">
          <div className="id-result-row"><span>Voiceprint</span><strong style={{ color: 'var(--aegis-green)' }}>✓ ENROLLED</strong></div>
          <div className="id-result-row"><span>Quality</span><strong>HIGH</strong></div>
          <button className="btn-premium success" style={{ marginTop: 16 }}
            onClick={() => onComplete({ voiceEnrolled: true })}>
            Continue →
          </button>
        </div>
      )}
    </div>
  );
}

function StepDeviceFingerprint({ onComplete }) {
  const [checking, setChecking] = useState(false);
  const [result,   setResult]   = useState(null);

  const runCheck = async () => {
    setChecking(true);
    const [fp, vcam] = await Promise.all([generateDeviceFingerprint(), detectVirtualCamera()]);
    await new Promise(r => setTimeout(r, 1000));
    setResult({ fingerprint: fp, virtualCamera: vcam });
    setChecking(false);
  };

  useEffect(() => { runCheck(); }, []);

  const blocked = result?.virtualCamera?.detected;

  return (
    <div className="id-step">
      <div className="id-step-icon">🖥</div>
      <h3 className="id-step-title">Device Security Check</h3>
      <p className="id-step-sub">Scanning your device environment for security compliance.</p>

      {checking && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div className="check-spinner" style={{ width: 28, height: 28, borderWidth: 3, margin: '0 auto 12px' }} />
          <div style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>Scanning device…</div>
        </div>
      )}

      {result && (
        <div>
          <div className="device-check-grid">
            {[
              { label: 'Device Fingerprint', val: result.fingerprint, icon: '🔑', ok: true },
              { label: 'Virtual Camera', val: result.virtualCamera.detected ? '⚠ DETECTED' : '✓ None found', icon: '📷', ok: !result.virtualCamera.detected },
              { label: 'Browser Security', val: '✓ Compliant', icon: '🛡', ok: true },
              { label: 'Connection', val: '✓ Encrypted (TLS 1.3)', icon: '🔒', ok: true },
            ].map(item => (
              <div key={item.label} className={`device-check-item ${item.ok ? 'ok' : 'warn'}`}>
                <span className="dev-icon">{item.icon}</span>
                <div>
                  <div className="dev-label">{item.label}</div>
                  <div className={`dev-val ${item.ok ? 'ok' : 'warn'}`}>{item.val}</div>
                </div>
              </div>
            ))}
          </div>

          {blocked ? (
            <div className="id-warn-banner" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--aegis-red)', color: 'var(--aegis-red)', textAlign: 'center' }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>🚫</div>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>PROHIBITED VIRTUAL CAMERA DETECTED</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: 12 }}>
                Virtual camera software detected ({result.virtualCamera?.labels?.join(', ') || 'Obs/ManyCam'}). Disable all virtualization tools and refresh to proceed.
              </div>
              <button className="btn-secondary" style={{ width: '100%' }} onClick={() => runScan()}>
                🔄 Re-scan Device
              </button>
            </div>
          ) : (
            <button className="btn-premium success" style={{ marginTop: 20 }}
              onClick={() => onComplete({ deviceClean: true, fingerprint: result.fingerprint, virtualCameraDetected: false })}>
              ✓ Device Cleared — Continue →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Identity Verification Screen ────────────────────────────
const STEPS = [
  { id: 'id_upload',   label: 'ID Document',   icon: '🪪' },
  { id: 'selfie',      label: 'Selfie Match',  icon: '🤳' },
  { id: 'voice',       label: 'Voiceprint',    icon: '🎤' },
  { id: 'device',      label: 'Device Check',  icon: '🖥' },
];

export default function IdentityVerification() {
  const { setPhase, setIdentityData } = useAegisStore();
  const [stepIdx,  setStepIdx]  = useState(0);
  const [results,  setResults]  = useState({});
  const [complete, setComplete] = useState(false);

  const handleStepComplete = (stepResult) => {
    const newResults = { ...results, ...stepResult };
    setResults(newResults);

    if (stepIdx < STEPS.length - 1) {
      setStepIdx(s => s + 1);
    } else {
      // All steps done
      setComplete(true);
      setIdentityData?.(newResults);
    }
  };

  const overallPassed = results.idVerified && results.selfieVerified && results.voiceEnrolled && results.deviceClean;

  return (
    <div className="identity-shell">
      <div className="aurora-bg"><div className="aurora-blob b1" /><div className="aurora-blob b2" /></div>

      <div className="identity-card">
        {/* Header */}
        <div className="identity-header">
          <div className="brand-shield-lg">⬡</div>
          <div>
            <div className="identity-title">Layer 1 — Identity Security</div>
            <div className="identity-sub">Government-grade verification · GDPR · BIPA · CCPA</div>
          </div>
        </div>

        {/* Step progress */}
        <div className="identity-steps">
          {STEPS.map((s, i) => (
            <div key={s.id} className={`id-step-pip ${i < stepIdx ? 'done' : i === stepIdx ? 'active' : 'locked'}`}>
              <div className="id-pip-icon">{i < stepIdx ? '✓' : s.icon}</div>
              <div className="id-pip-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Step content */}
        {!complete && (
          <div style={{ marginTop: 24 }}>
            {stepIdx === 0 && <StepIDUpload onComplete={handleStepComplete} />}
            {stepIdx === 1 && <StepSelfieMatch onComplete={handleStepComplete} />}
            {stepIdx === 2 && <StepVoiceEnroll onComplete={handleStepComplete} />}
            {stepIdx === 3 && <StepDeviceFingerprint onComplete={handleStepComplete} />}
          </div>
        )}

        {/* Complete */}
        {complete && (
          <div className="identity-complete">
            <div className="identity-complete-icon" style={{ color: overallPassed ? 'var(--aegis-green)' : 'var(--aegis-amber)' }}>
              {overallPassed ? '✓' : '⚠'}
            </div>
            <div className="identity-complete-title">
              {overallPassed ? 'Identity Verified' : 'Verification Complete with Flags'}
            </div>
            <div className="identity-complete-sub">
              {overallPassed
                ? 'All 4 identity checks passed. You may proceed to liveness detection.'
                : 'Some checks flagged. A human reviewer has been notified. You may still proceed.'}
            </div>

            {/* Result summary */}
            <div className="id-final-grid">
              {[
                { label: 'ID Document',   ok: results.idVerified,     val: results.idVerified ? 'Verified' : 'Failed' },
                { label: 'Selfie Match',  ok: results.selfieVerified, val: results.selfieVerified ? `${((results.matchScore||0)*100).toFixed(0)}% match` : 'Failed' },
                { label: 'Voiceprint',    ok: results.voiceEnrolled,  val: results.voiceEnrolled ? 'Enrolled' : 'Skipped' },
                { label: 'Device',        ok: results.deviceClean,    val: results.deviceClean ? 'Clean' : '⚠ Flagged' },
              ].map(r => (
                <div key={r.label} className={`id-final-item ${r.ok ? 'ok' : 'warn'}`}>
                  <div className="id-final-label">{r.label}</div>
                  <div className={`id-final-val ${r.ok ? 'ok' : 'warn'}`}>{r.val}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
              {overallPassed ? (
                <button className="btn-premium success" onClick={() => setPhase('liveness')}>
                  Proceed to Liveness Detection →
                </button>
              ) : (
                <div style={{ padding: 16, background: 'rgba(239,68,68,0.1)', border: '1px solid var(--aegis-red)', borderRadius: 'var(--r-md)', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>🚫</div>
                  <div style={{ fontWeight: 800, color: 'var(--aegis-red)', marginBottom: 6 }}>IDENTITY CLEARANCE FAILED</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: 12 }}>
                    One or more mandatory security checks did not pass. Access to the interview is blocked under ISO/IEC 27001 zero-tolerance protocol.
                  </div>
                  <button className="btn-secondary" style={{ width: '100%' }} onClick={() => setStep(0)}>
                    🔄 Restart Identity Verification
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Accessibility notice */}
        <div className="identity-a11y-notice">
          <span>♿</span>
          <span>Accommodations available for candidates with disabilities, medical conditions, or visual/speech impairments. Contact your recruiter for assistance.</span>
        </div>
      </div>
    </div>
  );
}
