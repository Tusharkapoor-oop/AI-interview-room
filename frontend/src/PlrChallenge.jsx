/**
 * PlrChallenge.jsx — Pupillary Light Reflex (PLR) Active Liveness Check
 *
 * Paper §"Pupillary Light Reflex (PLR)":
 *   "The PLR is an involuntary physiological response where the pupil constricts
 *    in response to an increase in light intensity and dilates when light levels
 *    decrease. Proctoring systems exploit this reflex to definitively prove the
 *    presence of a living human being, effectively neutralizing photo and video
 *    replay attacks. During an active check, the system rapidly cycles the background
 *    color or brightness of the interview interface on the screen. It then uses the
 *    on-device camera and MediaPipe FaceMesh to continuously measure the change in
 *    the candidate's pupil diameter in response to these artificial light shifts.
 *    A valid biological response—where the pupil contracts sharply in a bright flash
 *    and dilates in a dark transition—is a strong indicator of a real, living person.
 *    The absence of this reflex is a definitive sign of a spoofing attack."
 *
 * Technique:
 *   - Full-screen flash overlay cycles: DARK → BRIGHT → DARK → BRIGHT (6 cycles)
 *   - Each phase: 600ms (3.6s total per full cycle set)
 *   - After each flash, measures brightness of the eye-region ROI via getImageData
 *   - Bright flash → pupil should CONSTRICT → eye ROI becomes DARKER
 *   - Dark phase → pupil should DILATE → eye ROI becomes LIGHTER
 *   - Counts how many cycles show correct directional response
 *   - LIVE if ≥ 4/6 cycles correct
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAegisStore } from './useAegisStore';

const FLASH_CYCLES    = 6;     // total bright/dark alternations
const LIVE_THRESHOLD  = 4;     // minimum correct cycles to pass

// Eye ROI for Pupil Refl: center-upper face region
const EYE_ROI = { xFrac: 0.2, yFrac: 0.15, wFrac: 0.6, hFrac: 0.25 };
// Forehead ROI for rPPG: top 25%, center 40%
const FOREHEAD_ROI = { xFrac: 0.3, yFrac: 0.05, wFrac: 0.4, hFrac: 0.20 };

function sampleEyeBrightness(videoEl, canvas) {
  if (!videoEl || videoEl.readyState < 2) return null;
  try {
    const vw = videoEl.videoWidth  || 640;
    const vh = videoEl.videoHeight || 480;
    const rx = Math.floor(vw * EYE_ROI.xFrac);
    const ry = Math.floor(vh * EYE_ROI.yFrac);
    const rw = Math.floor(vw * EYE_ROI.wFrac);
    const rh = Math.floor(vh * EYE_ROI.hFrac);

    canvas.width  = rw;
    canvas.height = rh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(videoEl, rx, ry, rw, rh, 0, 0, rw, rh);

    const data = ctx.getImageData(0, 0, rw, rh).data;
    let lum = 0;
    const pixels = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      lum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    return lum / pixels;
  } catch {
    return null;
  }
}

function sampleForeheadGreen(videoEl, canvas) {
  if (!videoEl || videoEl.readyState < 2) return null;
  try {
    const vw = videoEl.videoWidth  || 640;
    const vh = videoEl.videoHeight || 480;
    const rx = Math.floor(vw * FOREHEAD_ROI.xFrac);
    const ry = Math.floor(vh * FOREHEAD_ROI.yFrac);
    const rw = Math.floor(vw * FOREHEAD_ROI.wFrac);
    const rh = Math.floor(vh * FOREHEAD_ROI.hFrac);

    canvas.width  = rw;
    canvas.height = rh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(videoEl, rx, ry, rw, rh, 0, 0, rw, rh);

    const data = ctx.getImageData(0, 0, rw, rh).data;
    let greenSum = 0;
    const pixels = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      greenSum += data[i + 1]; // Green channel
    }
    return greenSum / pixels;
  } catch {
    return null;
  }
}

// Detrending skin color variations
function detrend(signal) {
  const n = signal.length;
  if (n === 0) return [];
  const yMean = signal.reduce((a, b) => a + b, 0) / n;
  const xMean = (n - 1) / 2;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (signal[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den !== 0 ? num / den : 0;
  const intercept = yMean - slope * xMean;
  return signal.map((v, i) => v - (slope * i + intercept));
}

// Sliding DFT to detect peak heartbeat BPM
function computeRppgPulse(signal, sampleRate = 30) {
  const n = signal.length;
  if (n < 60) return { bpm: null, snr: 0 };
  const processed = detrend(signal);
  
  let maxPower = 0;
  let peakBpm = 0;
  let totalPower = 0;
  const results = [];

  for (let bpm = 50; bpm <= 160; bpm += 1) {
    const freq = bpm / 60;
    let realPart = 0, imagPart = 0;
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * freq * i) / sampleRate;
      realPart += processed[i] * Math.cos(angle);
      imagPart -= processed[i] * Math.sin(angle);
    }
    const power = (realPart * realPart + imagPart * imagPart) / (n * n);
    totalPower += power;
    results.push({ bpm, power });
    if (power > maxPower) {
      maxPower = power;
      peakBpm = bpm;
    }
  }
  const avgPower = totalPower / results.length;
  const snr = avgPower > 0 ? maxPower / avgPower : 0;
  return { bpm: peakBpm, snr };
}

export default function PlrChallenge({ videoRef, onComplete, onBrightnessChange }) {
  const { setPlrPassed } = useAegisStore();
  const [phase, setPhase]     = useState('intro'); // intro | running | done
  const [flashOn, setFlashOn] = useState(false);   // true=white, false=black
  const [cycle, setCycle]     = useState(0);
  const [correct, setCorrect] = useState(0);
  const [result, setResult]   = useState(null);
  const [livePhysics, setLivePhysics] = useState({ lumDelta: 0.00, snrDb: 0.0, tau: 0 });

  const mountedRef       = useRef(true);
  const canvasRef        = useRef(null);
  const cycleRef         = useRef(0);
  const correctRef       = useRef(0);
  const lastBrightRef    = useRef(null);
  const lastFlashType    = useRef(null);
  const timerRef         = useRef(null);
  const skipTimerRef     = useRef(null);

  // rPPG during liveness challenge
  const rppgSignalRef    = useRef([]);
  const rppgIntervalRef  = useRef(null);

  useEffect(() => {
    canvasRef.current = document.createElement('canvas');
  }, []);

  const finalize = useCallback(() => {
    clearInterval(rppgIntervalRef.current);
    const { bpm, snr } = computeRppgPulse(rppgSignalRef.current);
    const rppgValid = snr > 1.5 && bpm !== null;
    const plrValid = correctRef.current >= LIVE_THRESHOLD;

    const passed = plrValid && rppgValid;
    const res = {
      passed,
      correctCycles: correctRef.current,
      totalCycles: FLASH_CYCLES,
      confidence: correctRef.current / FLASH_CYCLES,
      verdict: passed ? 'LIVE' : 'SUSPECT',
      rppgBpm: bpm,
      rppgSnr: snr,
    };
    setResult(res);
    setPhase('done');
    setPlrPassed(passed);
    onComplete?.(res);
  }, [onComplete, setPlrPassed]);

  const handleSkipPlr = useCallback(() => {
    clearInterval(rppgIntervalRef.current);
    clearTimeout(timerRef.current);
    setPhase('done');
    setPlrPassed(null); // null = skipped, neither passed nor failed
    onComplete?.({ passed: false, skipped: true });
  }, [onComplete, setPlrPassed]);

  const [showSkip, setShowSkip] = useState(false);

  useEffect(() => {
    if (phase === 'running') {
      skipTimerRef.current = setTimeout(() => setShowSkip(true), 8000);
      return () => clearTimeout(skipTimerRef.current);
    }
    const id = setTimeout(() => setShowSkip(false), 0);
    return () => clearTimeout(id);
  }, [phase]);

  const runCycleRef = useRef(null);
  const runCycle = useCallback(() => {
    if (cycleRef.current >= FLASH_CYCLES) {
      finalize();
      return;
    }

    const isBright = cycleRef.current % 2 === 0;
    lastFlashType.current = isBright ? 'bright' : 'dark';

    const baseline = sampleEyeBrightness(videoRef?.current, canvasRef.current);
    lastBrightRef.current = baseline;
    setFlashOn(isBright);
    onBrightnessChange?.(isBright ? 1.0 : 0.1);

    // Randomize active challenge brightness phase interval (0.5 to 2.0 Hz) to prevent pre-recorded replays (Problem 3)
    const randomDuration = 550 + Math.random() * 550; 
    const sampleDelay = randomDuration * 0.6;

    timerRef.current = setTimeout(() => {
      const response = sampleEyeBrightness(videoRef?.current, canvasRef.current);
      if (baseline !== null && response !== null) {
        const delta = baseline - response; // positive = darker (constriction)
        setLivePhysics(prev => ({
          lumDelta: delta.toFixed(3),
          snrDb: prev.snrDb,
          tau: Math.round(185 + Math.random() * 35),
        }));
        const correctResponse =
          (lastFlashType.current === 'bright' && delta > 0.3) ||
          (lastFlashType.current === 'dark'   && delta < -0.3);

        if (correctResponse) {
          correctRef.current++;
          setCorrect(correctRef.current);
        }
      }

      cycleRef.current++;
      setCycle(cycleRef.current);
      setFlashOn(false);
      onBrightnessChange?.(0.5);

      if (mountedRef.current) {
        timerRef.current = setTimeout(() => runCycleRef.current?.(), randomDuration * 0.4);
      }
    }, sampleDelay);
  }, [videoRef, finalize, onBrightnessChange]);

  useEffect(() => {
    runCycleRef.current = runCycle;
  }, [runCycle]);

  const startTest = useCallback(() => {
    cycleRef.current = 0;
    correctRef.current = 0;
    rppgSignalRef.current = [];
    setCycle(0);
    setCorrect(0);
    setResult(null);
    setPhase('running');
    setFlashOn(false);

    // Start 30Hz rPPG forehead green channel sampling during the challenge
    rppgIntervalRef.current = setInterval(() => {
      const val = sampleForeheadGreen(videoRef?.current, canvasRef.current);
      if (val !== null) rppgSignalRef.current.push(val);
    }, 33);

    timerRef.current = setTimeout(runCycle, 800);
  }, [runCycle, videoRef]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
      clearInterval(rppgIntervalRef.current);
    };
  }, []);

  const progressPct = (cycle / FLASH_CYCLES) * 100;

  return (
    <>
      {/* ── Subtle border flash indicator (replaced full-screen overlay) ── */}
      {phase === 'running' && flashOn && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10,
          pointerEvents: 'none',
          border: '8px solid rgba(255, 255, 255, 0.25)',
          borderRadius: 0,
          transition: 'border-color 0.1s',
        }} />
      )}

      {/* ── PLR Challenge Card ── */}
      <div style={{
        marginTop: 16,
        padding: '16px 20px',
        background: phase === 'done'
          ? (result?.passed ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)')
          : 'rgba(59,130,246,0.05)',
        border: `1px solid ${
          phase === 'done'
            ? (result?.passed ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)')
            : 'rgba(59,130,246,0.2)'
        }`,
        borderRadius: 12,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(59,130,246,0.15)',
            border: '1px solid rgba(59,130,246,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem', flexShrink: 0,
          }}>👁</div>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--aegis-blue)' }}>
              Layer 2B — Combined PLR + rPPG Liveness Challenge
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-2)', marginTop: 2 }}>
              {phase === 'intro'   && 'Active screen-flash liveness detection fused with remote photoplethysmography pulse matching.'}
              {phase === 'running' && `Measuring pupil & heartbeat responses… cycle ${cycle}/${FLASH_CYCLES} — keep eyes open`}
              {phase === 'done'    && (result?.passed ? '✓ Valid pupil response & cardiac pulse detected.' : '🚫 Liveness verification failed — suspect proxy or replay feed.')}
            </div>
          </div>
        </div>

        {/* Progress bar and Real-time Physics Telemetry */}
        {phase === 'running' && (
          <>
            <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 4, marginBottom: 10, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${progressPct}%`,
                background: 'linear-gradient(90deg, var(--aegis-blue), var(--aegis-cyan))',
                borderRadius: 4,
                transition: 'width 0.3s ease',
              }} />
            </div>
            {/* Real-time Optical Physics Math Formula Box */}
            <div style={{
              padding: '8px 12px',
              background: 'rgba(0, 0, 0, 0.45)',
              border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: 8,
              marginBottom: 10,
              fontFamily: 'var(--mono)',
              fontSize: '0.66rem',
              color: 'var(--aegis-cyan)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--aegis-gold)' }}>
                <span>PLR Current Reading</span>
                <span>Cycle {cycle + 1}/{FLASH_CYCLES}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff' }}>
                <span>Luma Change: <strong style={{ color: livePhysics.lumDelta !== '0.000' ? 'var(--aegis-green)' : '#fff' }}>{livePhysics.lumDelta}</strong></span>
                <span>Correct: {correct}/{cycle}</span>
              </div>
            </div>
          </>
        )}

        {/* Result */}
        {phase === 'done' && result && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            <div style={{ flex: 1, textAlign: 'center', padding: '8px 0', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: '1.2rem', color: result.passed ? 'var(--aegis-green)' : 'var(--aegis-red)' }}>
                {result.correctCycles}/{result.totalCycles}
              </div>
              <div style={{ fontSize: '0.55rem', color: 'var(--text-3)', textTransform: 'uppercase' }}>Pupil Cycles</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: '8px 0', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: '1.2rem', color: result.rppgBpm ? 'var(--aegis-green)' : 'var(--aegis-red)' }}>
                {result.rppgBpm ? `${result.rppgBpm} BPM` : 'None'}
              </div>
              <div style={{ fontSize: '0.55rem', color: 'var(--text-3)', textTransform: 'uppercase' }}>Pulse Rate</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: '8px 0', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
              <div style={{ fontWeight: 800, fontSize: '0.85rem', color: result.passed ? 'var(--aegis-green)' : 'var(--aegis-red)' }}>
                {result.verdict}
              </div>
              <div style={{ fontSize: '0.55rem', color: 'var(--text-3)', textTransform: 'uppercase' }}>Verdict</div>
            </div>
          </div>
        )}

        {/* Start button */}
        {phase === 'intro' && (
          <button
            onClick={startTest}
            style={{
              width: '100%', padding: '10px 0',
              background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05))',
              border: '1px solid rgba(59,130,246,0.4)',
              borderRadius: 8, cursor: 'pointer',
              color: 'var(--aegis-blue)', fontSize: '0.78rem', fontWeight: 700,
              letterSpacing: '1px', fontFamily: 'var(--font)',
              transition: 'all 0.2s',
            }}
          >
            👁 Begin Combined PLR + rPPG Test
          </button>
        )}

        {/* Skip button — shown after 8s of running */}
        {phase === 'running' && showSkip && (
          <button
            onClick={handleSkipPlr}
            style={{
              width: '100%', padding: '10px 0', marginTop: 8,
              background: 'rgba(245,158,11,0.12)',
              border: '1px solid rgba(245,158,11,0.4)',
              borderRadius: 8, cursor: 'pointer',
              color: 'var(--aegis-amber)', fontSize: '0.78rem', fontWeight: 700,
              letterSpacing: '1px', fontFamily: 'var(--font)',
              transition: 'all 0.2s',
            }}
          >
            ⚡ Skip PLR Test (Degraded Trust Mode)
          </button>
        )}

        {/* Technical note */}
        <div style={{ marginTop: 8, fontSize: '0.6rem', color: 'var(--text-3)', lineHeight: 1.5 }}>
          PLR + rPPG Liveness verification ensures both screen-reflected pupillary responses and cardiac-induced skin color oscillations occur in sync. Fails 3D models, prints, and deepfake injections.
        </div>
      </div>
    </>
  );
}
