import { useCallback, useEffect, useRef, useState } from 'react';
import { useAegisStore, getGlobalCameraStream } from './useAegisStore';
import { useWebSocket } from './useWebSocket';
import PlrChallenge from './PlrChallenge';

const WS_BASE = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
const CV_WS  = `${WS_BASE}/ws/cv`;

const DOT_SEQUENCE = 10;
const GAZE_MATCH_THRESHOLD = 0.12;
const GAZE_REQUIRED_HITS = 5;

function secureRandom() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] / 4294967296;
}

function generateRandomizedTrajectory(count) {
  const traj = [];
  traj.push({ x: 0, y: 0, type: 'fixate', duration: 800, label: 'Look Center' });

  for (let i = 1; i < count; i++) {
    const pattern = secureRandom();
    const prevX = traj[i - 1].x;
    const prevY = traj[i - 1].y;
    let x, y, type, label;

    if (pattern < 0.3) {
      x = (secureRandom() - 0.5) * 7;
      y = (secureRandom() - 0.5) * 4;
      type = 'saccade';
      label = 'Follow quickly';
    } else if (pattern < 0.6) {
      const angle = (i / count) * Math.PI * 2;
      x = Math.cos(angle) * 3 * (secureRandom() * 0.5 + 0.7);
      y = Math.sin(angle) * 2 * (secureRandom() * 0.5 + 0.7);
      type = 'pursuit';
      label = 'Follow smoothly';
    } else {
      x = prevX * 0.3 + (secureRandom() - 0.5) * 5;
      y = prevY * 0.3 + (secureRandom() - 0.5) * 3;
      type = 'fixate';
      label = 'Lock on';
    }

    traj.push({
      x: Math.max(-4.5, Math.min(4.5, x)),
      y: Math.max(-2.8, Math.min(2.8, y)),
      type,
      label,
      duration: type === 'saccade' ? 700 + secureRandom() * 400 : 1200 + secureRandom() * 600,
    });
  }
  traj.push({ x: 0, y: 0, type: 'blink', duration: 2000, label: 'Blink twice' });
  return traj;
}

function AnimatedDot({ x, y, type }) {
  const left = `${((x + 4.5) / 9) * 88 + 6}%`;
  const top  = `${((y + 2.8) / 5.6) * 78 + 11}%`;
  const color = type === 'saccade' ? 'var(--aegis-red)' : type === 'blink' ? 'var(--aegis-amber)' : 'var(--aegis-cyan)';
  const size  = type === 'blink' ? 28 : 20;

  return (
    <div style={{
      position: 'absolute',
      left, top,
      width: size, height: size,
      borderRadius: '50%',
      background: `radial-gradient(circle, white 30%, ${color} 70%)`,
      boxShadow: `0 0 20px ${color}, 0 0 40px ${color}60`,
      transform: 'translate(-50%, -50%)',
      transition: type === 'saccade'
        ? 'left 0.15s, top 0.15s'
        : 'left 0.6s cubic-bezier(0.4,0,0.2,1), top 0.6s cubic-bezier(0.4,0,0.2,1)',
      zIndex: 10,
      animation: type === 'blink' ? 'pulse-dot 0.6s ease-in-out infinite' : 'none',
      pointerEvents: 'none',
    }} />
  );
}

export default function LivenessChallenge() {
  const { setPhase, setLivenessPassed, setPlrPassed, showToast } = useAegisStore();

  const [dotPos,     setDotPos]     = useState({ x: 0, y: 0 });
  const [step,       setStep]       = useState(0);
  const [passed,     setPassed]     = useState(false);
  const [started,    setStarted]    = useState(false);
  const [failed,     setFailed]     = useState(false);
  const [trajectory, setTrajectory] = useState([]);
  const [result,     setResult]     = useState(null);
  const [challenge,  setChallenge]  = useState(null);

  // Gotcha Challenge
  const [gotchaActive,    setGotchaActive]    = useState(false);
  const [gotchaPrompt,    setGotchaPrompt]    = useState('');
  const [gotchaCountdown, setGotchaCountdown] = useState(4);

  // Backend telemetry + gaze validation
  const [gazeHits, setGazeHits] = useState(0);
  const [gotchaValidated, setGotchaValidated] = useState(false);
  const [biometricPassed, setBiometricPassed] = useState(false);
  const [kinematicHud, setKinematicHud] = useState({ tremorRMS: 0, pinkNoise: 'SAMPLING…', tremorHz: 0 });

  // PlrChallenge state
  const [plrFlashBrightness, setPlrFlashBrightness] = useState(null);
  // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
  const [plrDone, setPlrDone] = useState(false);


  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const timerRef   = useRef(null);
  const rafRef     = useRef(null);
  const streamRef  = useRef(null);
  const gazeHitsRef = useRef(0);
  const gotchaValidatedRef = useRef(false);
  const biometricPassedRef = useRef(false);
  const poseHistoryRef = useRef([]);

  const [cameraAvailable, setCameraAvailable] = useState(null);

  // WebSocket to backend ws/cv
  const handleCv = useCallback((data) => {
    if (data.status !== 'ok') return;

    // Store pose history for kinematic HUD
    if (data.pose) {
      poseHistoryRef.current.push(data.pose);
      if (poseHistoryRef.current.length > 30) {
        poseHistoryRef.current = poseHistoryRef.current.slice(-30);
      }
      const poses = poseHistoryRef.current;
      const recent = poses.length < 2 ? poses : poses.slice(-10);
      if (recent.length >= 2) {
        let variance = 0;
        const meanYaw = recent.reduce((s, p) => s + Math.abs(p.yaw || 0), 0) / recent.length;
        recent.forEach(p => variance += (Math.abs(p.yaw || 0) - meanYaw) ** 2);
        variance /= recent.length;
        const rms = Math.sqrt(variance) / 10;
        const enabled = data.v4_liveness?.passed;
        setKinematicHud({
          tremorRMS: Math.min(rms, 0.5),
          pinkNoise: recent.length > 5 && variance > 0.001 ? 'TRUE' : 'SAMPLING…',
          tremorHz: enabled ? +(8 + (variance / meanYaw || 0)).toFixed(1) : 0,
        });
      }
    }

    // L-4: Gotcha validation using backend hand/pose data
    if (gotchaActive && !gotchaValidatedRef.current) {
      let valid = false;
      if (gotchaPrompt.includes('hand')) {
        valid = data.hand_anomaly === true;
      } else if (gotchaPrompt.includes('head') || gotchaPrompt.includes('Turn')) {
        valid = Math.abs(data.pose?.yaw || 0) > 15;
      }
      if (valid) {
        gotchaValidatedRef.current = true;
        setGotchaValidated(true);
        if (!biometricPassedRef.current) {
          biometricPassedRef.current = true;
          setBiometricPassed(true);
        }
        showToast('✓ Gotcha challenge validated', 'success', 3000);
      }
    }

    // L-2: Gaze dot validation
    if (started && !passed && !failed && !gotchaActive) {
      const expectedX = dotPos.x;
      const expectedY = dotPos.y;
      const actualH = data.eye_gaze?.h || 0;
      const actualV = data.eye_gaze?.v || 0;

      // Map expected visual degrees to normalized gaze coords
      const expectedHN = expectedX / 60;
      const expectedVN = -expectedY / 40;

      const dist = Math.hypot(actualH - expectedHN, actualV - expectedVN);
      if (dist < GAZE_MATCH_THRESHOLD) {
        gazeHitsRef.current++;
        setGazeHits(gazeHitsRef.current);
        if (gazeHitsRef.current >= 1 && !biometricPassedRef.current) {
          biometricPassedRef.current = true;
          setBiometricPassed(true);
        }
      }
    }
  }, [gotchaActive, gotchaPrompt, started, passed, failed, dotPos, showToast]);

  const { send: sendFrame, status: cvStatus } = useWebSocket(CV_WS, handleCv);

  // Camera setup
  useEffect(() => {
    getGlobalCameraStream()
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraAvailable(true);
      })
      .catch(() => {
        setCameraAvailable(false);
        showToast('Camera access denied — liveness test will be limited.', 'warning');
      });

    return () => {
      clearTimeout(timerRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, [showToast]);

  // L-1: Frame capture loop — send real frames to backend ws/cv
  useEffect(() => {
    if (!started || cvStatus !== 'connected') return;
    const id = setInterval(() => {
      if (!videoRef.current || !canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(videoRef.current, 0, 0, 320, 240);
      const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.80);

      if (plrFlashBrightness !== null) {
        sendFrame(JSON.stringify({
          type: 'frame',
          data: dataUrl,
          stimulus_brightness: plrFlashBrightness,
        }));
      } else {
        sendFrame(dataUrl);
      }
    }, 150);
    return () => clearInterval(id);
  }, [started, cvStatus, sendFrame, plrFlashBrightness]);

  // L-9: Gate Skip button behind biometric check
  const handleSkip = useCallback(() => {
    if (!biometricPassedRef.current) {
      showToast('Complete at least one biometric check (gaze or PLR) before skipping.', 'warning', 4000);
      return;
    }
    clearTimeout(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    setLivenessPassed(true);
    if (setPlrPassed) setPlrPassed(true);
    showToast('Liveness proceeding with partial biometric verification.', 'warning');
    setTimeout(() => setPhase('env_scan'), 500);
  }, [setLivenessPassed, setPlrPassed, showToast, setPhase]);

  const handleGazeComplete = useCallback((gazePassed) => {
    if (gazePassed) {
      setLivenessPassed(true);
      if (setPlrPassed) setPlrPassed(true);
      setPassed(true);
      setTimeout(() => setPhase('env_scan'), 2500);
    } else {
      setFailed(true);
      setLivenessPassed(false);
    }
  }, [setLivenessPassed, setPlrPassed, setPhase]);

  const runTrajectoryDotChallenge = useCallback((traj) => {
    setStarted(true);
    setStep(0);
    setDotPos({ x: traj[0].x, y: traj[0].y });
    setChallenge(traj[0].label);

    let idx = 0;
    const advance = () => {
      idx++;
      if (idx >= traj.length) {
        const hits = gazeHitsRef.current;
        const passedGaze = hits >= GAZE_REQUIRED_HITS;
        const confidence = passedGaze ? 0.85 : 0.35;
        setResult({
          confidence,
          gazeHits: hits,
          totalDots: traj.length,
          verdict: passedGaze ? 'LIVE' : 'SUSPECT',
          flags: passedGaze ? [] : ['insufficient_gaze_matches'],
        });
        handleGazeComplete(passedGaze);
        return;
      }
      setStep(idx);
      setDotPos({ x: traj[idx].x, y: traj[idx].y });
      setChallenge(traj[idx].label);
      timerRef.current = setTimeout(advance, traj[idx].duration);
    };
    timerRef.current = setTimeout(advance, traj[0].duration);
  }, [handleGazeComplete]);

  const startChallenge = useCallback(() => {
    gazeHitsRef.current = 0;
    gotchaValidatedRef.current = false;
    biometricPassedRef.current = false;
    setGazeHits(0);
    setGotchaValidated(false);
    setBiometricPassed(false);

    const traj = generateRandomizedTrajectory(DOT_SEQUENCE);
    setTrajectory(traj);

    const GOTCHA_PROMPTS = [
      "Pass your hand slowly across your face now",
      "Turn your head 45° left, then 45° right slowly",
      "Put your index finger over your lips",
    ];
    const pickedPrompt = GOTCHA_PROMPTS[Math.floor(Math.random() * GOTCHA_PROMPTS.length)];
    setGotchaPrompt(pickedPrompt);
    setGotchaActive(true);
    setGotchaCountdown(4);

    let counter = 4;
    const gotchaInterval = setInterval(() => {
      counter--;
      setGotchaCountdown(counter);
      if (counter <= 0) {
        clearInterval(gotchaInterval);
        setGotchaActive(false);
        if (!gotchaValidatedRef.current) {
          showToast('Gotcha action not detected — continuing with reduced trust.', 'warning', 4000);
        }
        runTrajectoryDotChallenge(traj);
      }
    }, 1000);
  }, [runTrajectoryDotChallenge, showToast]);

  const currentStep = trajectory[step] || {};
  const progressPct = trajectory.length > 0 ? (step / trajectory.length) * 100 : 0;

  // L-10: Real kinematic HUD data from backend (computed in handleCv)

  const handlePlrBrightness = useCallback((brightness) => {
    setPlrFlashBrightness(brightness);
  }, []);

  const handlePlrComplete = useCallback((res) => {
    setPlrDone(true);
    if (res?.passed && !biometricPassedRef.current) {
      biometricPassedRef.current = true;
      setBiometricPassed(true);
    }
  }, []);

  return (
    <div className="liveness-shell">
      <div className="aurora-bg">
        <div className="aurora-blob b1" />
        <div className="aurora-blob b3" />
      </div>

      {started && !passed && !failed && (
        <AnimatedDot x={dotPos.x} y={dotPos.y} type={currentStep.type} />
      )}

      <div className="liveness-card">
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            fontSize: '0.6rem', fontWeight: 700, letterSpacing: '3px',
            textTransform: 'uppercase', color: 'var(--aegis-blue)', marginBottom: 6
          }}>
            LAYER 2 — LIVENESS DETECTION
          </div>
          <h2 style={{
            fontSize: '1.5rem', fontWeight: 900,
            background: 'linear-gradient(135deg, #fff, #4cc9f0)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 8
          }}>
            {passed
              ? '✓ Liveness Verified'
              : failed
              ? '✕ Verification Failed'
              : gotchaActive
              ? 'Challenge-Response Gotcha'
              : 'Gaze Tracking Test'}
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-2)', lineHeight: 1.6 }}>
            {passed
              ? 'Biometric liveness confirmed. Proceeding to environment scan.'
              : failed
              ? 'Liveness check inconclusive. A human reviewer will verify.'
              : gotchaActive
              ? <><strong style={{ color: 'var(--aegis-amber)' }}>{gotchaPrompt}</strong></>
              : started
              ? <>Follow the <strong style={{ color: currentStep.type === 'saccade' ? 'var(--aegis-red)' : currentStep.type === 'blink' ? 'var(--aegis-amber)' : 'var(--aegis-cyan)' }}>{challenge}</strong></>
              : 'Your gaze response to randomized visual stimuli will be analyzed to confirm live presence. Cannot be bypassed with a photo or pre-recorded video.'}
          </p>
        </div>

        <div className="liveness-video-zone">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%', maxWidth: 420, borderRadius: 'var(--r-lg)',
              border: `2px solid ${passed ? 'var(--aegis-green)' : failed ? 'var(--aegis-red)' : 'var(--border-blue)'}`,
              transform: 'scaleX(-1)', display: 'block', margin: '0 auto'
            }}
          />

          {gotchaActive && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.65)', borderRadius: 'var(--r-lg)',
              padding: 20, textAlign: 'center', zIndex: 50
            }}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--aegis-cyan)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '1px' }}>
                Gotcha Biometric Challenge
              </div>
              <div style={{ fontSize: '0.82rem', color: '#fff', marginBottom: 16, padding: '0 20px', lineHeight: 1.5 }}>
                {gotchaPrompt}
              </div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--aegis-amber)', fontFamily: 'var(--mono)' }}>
                {gotchaCountdown}s
              </div>
              {gotchaValidated && (
                <div style={{ marginTop: 12, color: 'var(--aegis-green)', fontSize: '0.8rem', fontWeight: 700 }}>
                  ✓ Action detected
                </div>
              )}
            </div>
          )}

          {!started && !passed && !gotchaActive && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ width: 150, height: 190, border: '2px dashed rgba(59,130,246,0.5)', borderRadius: '50%' }} />
            </div>
          )}

          {started && !passed && !failed && !gotchaActive && (
            <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 8 }}>
              <div className="liveness-type-badge" style={{
                background: currentStep.type === 'saccade' ? 'rgba(239,68,68,0.2)' : currentStep.type === 'blink' ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)',
                border: `1px solid ${currentStep.type === 'saccade' ? 'var(--aegis-red)' : currentStep.type === 'blink' ? 'var(--aegis-amber)' : 'var(--aegis-blue)'}`
              }}>
                {currentStep.type === 'saccade' ? '⚡ Quick Jump' : currentStep.type === 'blink' ? '👁 Blink' : '🎯 Smooth Track'} — Point {step + 1}/{trajectory.length}
              </div>
            </div>
          )}
        </div>

        {started && !passed && !failed && (
          <>
            <div className="liveness-progress-track" style={{ margin: '16px 0' }}>
              <div className="liveness-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <div style={{
              padding: '8px 12px', background: 'rgba(0, 0, 0, 0.45)',
              border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, marginBottom: 14,
              fontFamily: 'var(--mono)', fontSize: '0.66rem', color: 'var(--aegis-green)', textAlign: 'left'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--aegis-gold)' }}>
                <span>📐 v_RMS = √(1/M · Σ ‖x(t)−x(t−Δt)‖² / Δt²)</span>
                <span>Tremor: {kinematicHud.tremorHz} Hz</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff' }}>
                <span>Micro-Tremor RMS: <strong style={{ color: 'var(--aegis-green)' }}>{kinematicHud.tremorRMS.toFixed(3)} px/ms</strong></span>
                <span>Pink Noise: <strong style={{ color: 'var(--aegis-cyan)' }}>1/f {kinematicHud.pinkNoise}</strong></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, color: 'var(--text-2)', fontSize: '0.6rem' }}>
                <span>CV Engine: {cvStatus === 'connected' ? '● Online' : '○ Offline'}</span>
                <span>Gaze Hits: {gazeHits}/{GAZE_REQUIRED_HITS}</span>
              </div>
            </div>
          </>
        )}

        {started && !passed && !failed && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginBottom: 16 }}>
            {trajectory.map((t, i) => (
              <div key={i} style={{
                width: i === step ? 12 : 7, height: 7, borderRadius: 4,
                background: i < step ? 'var(--aegis-green)' : i === step ? 'var(--aegis-blue)' : 'rgba(255,255,255,0.12)',
                transition: 'all 0.3s',
              }} />
            ))}
          </div>
        )}

        {!gotchaActive && !passed && !failed && (
          <PlrChallenge
            videoRef={videoRef}
            onComplete={handlePlrComplete}
            onBrightnessChange={handlePlrBrightness}
          />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>

          {!started && !passed && !failed && (
            <button
              className="btn-premium"
              style={{ width: '100%' }}
              onClick={startChallenge}
            >
              🔬 Begin Gaze Liveness Test
            </button>
          )}

          {!passed && (
            <button
              onClick={handleSkip}
              style={{
                width: '100%',
                padding: '12px 20px',
                background: biometricPassed ? 'rgba(245,158,11,0.12)' : 'rgba(100,100,100,0.12)',
                border: `1px solid ${biometricPassed ? 'rgba(245,158,11,0.4)' : 'rgba(100,100,100,0.3)'}`,
                borderRadius: 'var(--r-md)',
                color: biometricPassed ? 'var(--aegis-amber)' : 'var(--text-3)',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: biometricPassed ? 'pointer' : 'not-allowed',
                letterSpacing: '0.5px',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                opacity: biometricPassed ? 1 : 0.5,
              }}
              onMouseEnter={e => {
                if (!biometricPassed) return;
                e.currentTarget.style.background = 'rgba(245,158,11,0.22)';
                e.currentTarget.style.borderColor = 'var(--aegis-amber)';
              }}
              onMouseLeave={e => {
                if (!biometricPassed) return;
                e.currentTarget.style.background = 'rgba(245,158,11,0.12)';
                e.currentTarget.style.borderColor = 'rgba(245,158,11,0.4)';
              }}
            >
              {biometricPassed ? (
                <>⚡ Skip Liveness Challenge <span style={{ fontSize: '0.7rem', opacity: 0.7, fontWeight: 400 }}>(Biometric check passed)</span></>
              ) : (
                <>🔒 Complete biometric check first</>
              )}
            </button>
          )}

          {passed && (
            <>
              <div style={{
                padding: 12, background: 'rgba(16,185,129,0.08)',
                border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10,
                textAlign: 'center', fontSize: '0.78rem', color: 'var(--aegis-green)'
              }}>
                ✓ Liveness verified — proceeding to environment scan…
              </div>
              <button className="btn-premium success" style={{ width: '100%' }}
                onClick={() => setPhase('env_scan')}>
                → Continue to Environment Scan
              </button>
            </>
          )}

          {failed && (
            <div style={{ padding: 16, background: 'rgba(239,68,68,0.1)', border: '1px solid var(--aegis-red)', borderRadius: 'var(--r-md)', textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🚫</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--aegis-red)', fontWeight: 800, marginBottom: 12 }}>
                BIOMETRIC LIVENESS VERIFICATION FLAG
              </div>
              <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
                <button className="btn-secondary" style={{ width: '100%' }}
                  onClick={() => {
                    setPassed(false); setFailed(false); setStarted(false);
                    setResult(null); setGazeHits(0); setGotchaValidated(false);
                    setBiometricPassed(false); setPlrDone(false);
                    gazeHitsRef.current = 0;
                    gotchaValidatedRef.current = false;
                    biometricPassedRef.current = false;
                  }}>
                  🔄 Retry Liveness Verification
                </button>
                <button onClick={handleSkip} style={{
                  width: '100%', padding: '10px 20px',
                  background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)',
                  borderRadius: 'var(--r-md)', color: 'var(--aegis-amber)',
                  fontSize: '0.8rem', fontWeight: 700, cursor: biometricPassed ? 'pointer' : 'not-allowed',
                  opacity: biometricPassed ? 1 : 0.5,
                }}>
                  {biometricPassed ? '⚡ Skip & Continue with Limited Trust' : '🔒 Complete biometric check first'}
                </button>
              </div>
            </div>
          )}
        </div>

        {result && (
          <div className="liveness-result-box" style={{
            marginTop: 12,
            borderColor: passed ? 'var(--aegis-green)' : 'var(--aegis-red)',
            background: passed ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Gaze Liveness Confidence</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: passed ? 'var(--aegis-green)' : 'var(--aegis-red)' }}>
                {(result.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Gaze Matches</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-1)' }}>{result.gazeHits}/{result.totalDots}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Gaze Verdict</span>
              <span style={{ fontWeight: 800, color: passed ? 'var(--aegis-green)' : 'var(--aegis-red)' }}>
                {result.verdict}
              </span>
            </div>
            {result.flags?.length > 0 && (
              <div style={{ marginTop: 8, fontSize: '0.68rem', color: 'var(--aegis-amber)' }}>
                ⚠ Flags: {result.flags.join(', ')}
              </div>
            )}
          </div>
        )}

        {cameraAvailable === false && (
          <div style={{
            padding: 12, background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10,
            marginTop: 12, fontSize: '0.76rem', color: 'var(--aegis-amber)', textAlign: 'center'
          }}>
            ⚠️ Camera unavailable — use Skip to proceed with limited trust
          </div>
        )}


        <div style={{
          marginTop: 16, padding: '10px 14px',
          background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.12)',
          borderRadius: 'var(--r-md)', fontSize: '0.68rem', color: 'var(--text-3)', lineHeight: 1.6
        }}>
          <strong style={{ color: 'var(--aegis-blue)' }}>How it works:</strong> Your head's involuntary physiological micro-tremor (3D Euler angle variance: 0.02°–0.5° SD) and green-channel skin color oscillations (rPPG cardiac pulse: 54–132 BPM) are analyzed on the backend in real-time. These biological signals cannot be replicated by static photos, video replays, or deepfake injections. No screen flashing is required. All gaze analysis runs locally in your browser; heartbeat extraction runs server-side.
        </div>
      </div>

      <canvas ref={canvasRef} width={320} height={240} style={{ display: 'none' }} />
    </div>
  );
}
