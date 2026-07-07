/**
 * useRppg.js — Remote Photoplethysmography (rPPG) Hook
 *
 * Paper §"Remote Photoplethysmography":
 *   "extracts a user's heartbeat from a standard video stream by analyzing minute,
 *    cyclical variations in skin color caused by blood flow... applies signal processing
 *    techniques, such as Fast Fourier Transform (FFT), to extract the heart rate signal.
 *    Because photos, masks, and even some deepfakes lack a realistic, pulsatile blood flow,
 *    the successful detection of a heartbeat via rPPG serves as a powerful proof of life."
 *
 * Implementation:
 *   - Samples the green channel mean from the forehead skin ROI every 33ms (~30fps)
 *   - Maintains a 10-second rolling buffer (~300 samples)
 *   - Applies linear detrending + bandpass filter (0.7–4 Hz → 42–240 BPM)
 *   - Uses a sliding DFT to find the dominant frequency peak
 *   - Reports BPM, signal quality (SNR), and a liveness verdict
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useAegisStore } from './useAegisStore';

// ── Constants ─────────────────────────────────────────────────────────────────
const SAMPLE_RATE_HZ   = 30;          // target frame samples per second
const WINDOW_SECONDS   = 10;          // rolling buffer length
const WINDOW_SIZE      = SAMPLE_RATE_HZ * WINDOW_SECONDS; // 300 samples
const BPM_MIN          = 42;          // 0.7 Hz
const BPM_MAX          = 210;         // 3.5 Hz
const FREQ_MIN         = BPM_MIN  / 60;
const FREQ_MAX         = BPM_MAX  / 60;
const CAPTURE_INTERVAL = 1000 / SAMPLE_RATE_HZ;  // ms between frames

// ROI: forehead region — top 25% of frame, center 40% horizontally
const ROI = { xFrac: 0.3, yFrac: 0.0, wFrac: 0.4, hFrac: 0.25 };

// ── Signal Processing Utilities ───────────────────────────────────────────────

/** Compute mean of an array */
function mean(arr) {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

/** Linear detrend — remove linear slope from signal */
function detrend(signal) {
  if (signal.length === 0) return [];
  const n = signal.length;
  const xMean = (n - 1) / 2;
  const yMean = mean(signal);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (signal[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den !== 0 ? num / den : 0;
  const intercept = yMean - slope * xMean;
  return signal.map((v, i) => v - (slope * i + intercept));
}

/** Check if signal has zero variance (all values identical) */
function hasZeroVariance(signal) {
  if (signal.length < 2) return true;
  const first = signal[0];
  for (let i = 1; i < signal.length; i++) {
    if (signal[i] !== first) return false;
  }
  return true;
}

/** Simple Hann window to reduce spectral leakage */
function applyHann(signal) {
  const n = signal.length;
  return signal.map((v, i) => v * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1))));
}

/**
 * Sliding DFT — compute power at specific frequencies.
 * More efficient than full FFT for our narrow band of interest.
 * Returns: { bpm, power, snr }
 */
function slidingDft(signal, sampleRate) {
  const n = signal.length;
  if (n < 3 || hasZeroVariance(signal)) return { bpm: 0, power: 0, snr: 0, totalPower: 0 };

  const detrendedWindowed = applyHann(detrend(signal));

  // Test frequencies in 0.1 BPM increments across our band
  const freqStepBpm = 0.5;
  let maxPower = 0;
  let peakBpm = 0;
  let totalPower = 0;

  const results = [];
  for (let bpm = BPM_MIN; bpm <= BPM_MAX; bpm += freqStepBpm) {
    const freq = bpm / 60;
    let realPart = 0, imagPart = 0;
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * freq * i) / sampleRate;
      realPart += detrendedWindowed[i] * Math.cos(angle);
      imagPart -= detrendedWindowed[i] * Math.sin(angle);
    }
    const power = (realPart * realPart + imagPart * imagPart) / (n * n);
    totalPower += power;
    results.push({ bpm, power });
    if (power > maxPower) {
      maxPower = power;
      peakBpm = bpm;
    }
  }

  // SNR: ratio of peak power to average out-of-band power
  const avgPower = totalPower / results.length;
  const snr = avgPower > 0 ? maxPower / avgPower : 0;

  return { bpm: peakBpm, power: maxPower, snr, totalPower };
}

/** Extract mean green channel from ROI of a video element */
function extractGreenMean(videoEl, canvasEl) {
  if (!videoEl || !canvasEl || videoEl.readyState < 2) return null;
  const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
  const vw = videoEl.videoWidth  || 640;
  const vh = videoEl.videoHeight || 480;

  const roiX = Math.floor(vw * ROI.xFrac);
  const roiY = Math.floor(vh * ROI.yFrac);
  const roiW = Math.floor(vw * ROI.wFrac);
  const roiH = Math.floor(vh * ROI.hFrac);

  // Draw just the ROI to a tiny canvas for speed
  canvasEl.width  = roiW;
  canvasEl.height = roiH;
  ctx.drawImage(videoEl, roiX, roiY, roiW, roiH, 0, 0, roiW, roiH);

  try {
    const data = ctx.getImageData(0, 0, roiW, roiH).data;
    let greenSum = 0;
    const pixels = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      greenSum += data[i + 1]; // Green channel
    }
    return greenSum / pixels;
  } catch {
    return null; // canvas taint
  }
}

// ── Main Hook ─────────────────────────────────────────────────────────────────
export function useRppg(videoRef, enabled = true) {
  const { addRiskEvent, updateIntegrityScore, showToast, phase } = useAegisStore();
  const relaxedProctoringEnabled = useAegisStore(s => s.relaxedProctoringEnabled);
  const setRppgData = useAegisStore(s => s.setRppgData);

  const [localRppg, setLocalRppg] = useState({
    bpm: null, snr: 0, isLive: null,
    signalStrength: 0, status: 'initializing', sampleCount: 0,
  });

  const bufferRef     = useRef([]);    // rolling green-channel samples
  const canvasRef     = useRef(null);  // off-screen canvas for pixel extraction
  const intervalRef   = useRef(null);
  const analyzeRef    = useRef(null);
  const captureRef    = useRef(null);
  const noSignalCount = useRef(0);
  const flaggedRef    = useRef(false);
  const relaxedRef    = useRef(relaxedProctoringEnabled);

  // Create persistent off-screen canvas
  useEffect(() => {
    canvasRef.current = document.createElement('canvas');
  }, []);

  // Keep ref in sync with reactive value for use in interval callbacks
  useEffect(() => {
    relaxedRef.current = relaxedProctoringEnabled;
  }, [relaxedProctoringEnabled]);

  const analyzePulse = useCallback(() => {
    const buf = bufferRef.current;
    if (buf.length < SAMPLE_RATE_HZ * 5) return; // need ≥5s of data

    const signal = buf.slice(-WINDOW_SIZE);
    const { bpm, snr } = slidingDft(signal, SAMPLE_RATE_HZ);

    // Signal quality: SNR > 2 means there's a clear peak above the noise floor
    const signalStrength = Math.min(snr / 8, 1.0); // normalize to 0–1
    const isPlausibleBpm = bpm >= BPM_MIN + 8 && bpm <= BPM_MAX - 30; // 50–180 BPM physiological range
    const hasGoodSignal  = snr > 1.8;
    const isLive = isPlausibleBpm && hasGoodSignal;

    const rppgData = {
      bpm:            isLive ? Math.round(bpm) : null,
      snr:            +snr.toFixed(2),
      isLive,
      signalStrength: +signalStrength.toFixed(3),
      status:         isLive ? 'live' : snr < 0.8 ? 'no_signal' : 'weak_signal',
      sampleCount:    buf.length,
    };

    setLocalRppg(rppgData);
    setRppgData?.(rppgData);

    // Anti-spoofing: sustained absence of pulse signal → flag
    if (!isLive) {
      noSignalCount.current++;
      if (noSignalCount.current >= 3 && !flaggedRef.current && !relaxedRef.current) {
        flaggedRef.current = true;
        addRiskEvent({
          type:     'RPPG_NO_HEARTBEAT',
          severity: 'HIGH',
          desc:     `rPPG anti-spoofing: No physiological heartbeat signal detected (SNR=${snr.toFixed(2)}). Possible photo, mask, or deepfake attack.`,
        });
        updateIntegrityScore();
        showToast('🫀 No biological pulse detected — liveness check failed.', 'error', 8000);
      }
    } else {
      noSignalCount.current = 0;
      flaggedRef.current    = false;
    }
  }, [addRiskEvent, updateIntegrityScore, showToast, setRppgData]);

  // ── Sample loop ───────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || phase !== 'interview') return;

    captureRef.current = () => {
      const green = extractGreenMean(videoRef?.current, canvasRef.current);
      if (green !== null) {
        bufferRef.current.push(green);
        if (bufferRef.current.length > WINDOW_SIZE + 30) {
          bufferRef.current = bufferRef.current.slice(-WINDOW_SIZE);
        }
      }
    };

    intervalRef.current = setInterval(() => captureRef.current?.(), CAPTURE_INTERVAL);
    // Analyze every 4 seconds once we have enough data
    analyzeRef.current  = setInterval(analyzePulse, 4000);

    return () => {
      clearInterval(intervalRef.current);
      clearInterval(analyzeRef.current);
      captureRef.current = null;
      bufferRef.current = [];
    };
  }, [enabled, phase, videoRef, analyzePulse]);

  return localRppg;
}
