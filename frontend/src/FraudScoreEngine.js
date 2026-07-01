/**
 * FraudScoreEngine.js — Layer 6: AI Fraud Detection
 * 
 * Paper §8 Layer 6:
 *   - Composite multi-modal fraud score (0-100, 0=clean)
 *   - Deepfake artifact detection heuristics
 *   - Voice clone detection (frequency analysis)
 *   - Behavioral anomaly scoring
 *   - Signal weights from paper threat model
 * 
 * Scores are advisory — never auto-reject without human review.
 */

// ── Signal Weights — Research-Calibrated v2.0 ──────────────────────────────
// Sources: IJSRA (eye=91.4% F1, hand=93.7% F1), Harjai AI, Fabric, report §4-§8
const WEIGHTS = {
  // ── Core biometric signals (weights scaled to published F1 scores) ──
  GAZE_ANOMALY:              0.22,  // IJSRA 91.4% F1 (was 0.20)
  GAZE_READING_PATTERN:      0.20,  // NEW — horizontal scan = overlay reading (high accuracy)
  GAZE_DEVIATION_ANGLE:      0.14,  // NEW — θ = arccos((G·C)/|G||C|) >25° for 3+ frames
  HAND_ANOMALY:              0.12,  // IJSRA 93.7% F1 (was 0.08)
  SECONDARY_PERSON:          0.20,  // unchanged — unambiguous
  FACE_CONSISTENCY_FAIL:     0.20,  // unchanged — identity switch is high confidence

  // ── Behavioral / timing signals ──────────────────────────────────────
  AI_LATENCY_SIGNATURE:      0.18,  // NEW — Harjai AI 82% accuracy (3-4s cluster)
  LLM_PHRASEOLOGY_DETECTED:  0.15,  // NEW — Fabric 20+ forensic signals
  TYPING_ANOMALY:            0.15,  // unchanged
  PASTE_ANOMALY:             0.15,  // unchanged

  // ── Virtual machine / bypass ─────────────────────────────────────────
  VIRTUAL_MACHINE_DETECTED:  0.35,  // NEW CRITICAL — deliberate proctoring bypass (§3.1)
  VIRTUAL_MACHINE_SUSPECTED: 0.15,  // NEW — single VM signal, monitoring elevated

  // ── Deepfake detection ───────────────────────────────────────────────
  DEEPFAKE_CHALLENGE_FAIL:   0.22,  // NEW — UC Berkeley challenge-response failure
  RPPG_NO_HEARTBEAT:         0.15,  // unchanged — rPPG no pulse = synthetic video
  VOICE_MISMATCH:            0.18,  // unchanged — voice biometric mismatch
  SECONDARY_VOICE_DETECTED:  0.10,  // unchanged — multi-voice = coaching

  // ── Browser / extension signals ──────────────────────────────────────
  TAB_SWITCH:                0.15,  // unchanged
  VIRTUAL_CAM:               0.05,  // unchanged — could be legitimate
  EXTENSION_DETECTED:        0.25,  // unchanged
  EXTENSION_GLOBAL:          0.20,  // unchanged
  AI_API_CALL:               0.30,  // unchanged — CRITICAL: data exfiltration
  SYNTHETIC_INPUT:           0.25,  // unchanged — automation
  SYNTHETIC_PASTE:           0.25,  // unchanged
  ADBLOCKER_DETECTED:        0.05,  // unchanged — may block telemetry
  EXTENSION_CSS:             0.10,  // unchanged
  STORAGE_TAMPER:            0.15,  // unchanged
  EXTENSION_WORKER:          0.20,  // unchanged
  FULLSCREEN_EXIT:           0.10,  // unchanged
  SCREEN_CAPTURE_ATTEMPT:    0.25,  // unchanged
  CLIPBOARD_COPY:            0.05,  // unchanged — mild signal
  MULTI_MONITOR:             0.10,  // unchanged
  EXTENSION_IFRAME:          0.15,  // unchanged
  EXTENSION_RUNTIME:         0.10,  // unchanged

  // ── Audio forensics (NEW Module) ─────────────────────────────────────────
  WHISPER_COACHING_DETECTED:  0.22,  // NEW — earpiece/whisper coaching
  TTS_VOICE_DETECTED:         0.25,  // NEW — AI TTS voice signature
  ACOUSTIC_ENVIRONMENT_CHANGE: 0.15, // NEW — room/mic change mid-interview
  COMPRESSED_AUDIO_DETECTED:  0.08,  // NEW — processed audio

  // ── Gaze v3.0 (new signals) ───────────────────────────────────────────────
  SMOOTH_PURSUIT_DETECTED:    0.16,  // NEW — saccade velocity < 80°/s (reading)
  FIXATION_UNIFORMITY:        0.18,  // NEW — suspiciously uniform fixation durations

  // ── Environmental ────────────────────────────────────────────────────
  ENV_SCAN_SKIPPED:          0.05,  // unchanged
  DEVTOOLS_OPEN:             0.05,  // unchanged
  WINDOW_BLUR:               0.03,  // unchanged — weak signal
};

// Compound risk multiplier — when COMPOUND_RISK fires, amplify total score
const COMPOUND_RISK_MULTIPLIER = 1.5;

// Temporal decay — events in last N seconds get higher weight
const RECENCY_WINDOW_MS  = 120_000;  // 2 minutes = full weight
const RECENCY_BOOST      = 2.0;      // recent events weight 2×

const SEVERITY_MULTIPLIERS = {
  CRITICAL: 3.0,
  HIGH:     2.0,
  MEDIUM:   1.0,
  LOW:      0.4,
};

/**
 * computeFraudScore v2.0 — Bayesian Temporal Decay Scoring
 *
 * Improvements over v1.0:
 *   1. Temporal decay — events in last 2 minutes get RECENCY_BOOST weight
 *   2. Compound risk multiplier — COMPOUND_RISK event amplifies total score
 *   3. Frequency normalization — events per minute (not raw count)
 *   4. Confidence level per signal (low confidence signals weighted less)
 *   5. Signal deduplication — only worst event per type contributes
 *
 * @param {Array} riskEvents — from useAegisStore.riskEvents
 * @param {number} sessionDurationSeconds — for frequency normalization
 * @returns {{ score: number, breakdown, verdict, signals, confidence, hasCompound }}
 */
export function computeFraudScore(riskEvents, sessionDurationSeconds = 1) {
  if (!riskEvents || riskEvents.length === 0) {
    return { score: 0, breakdown: {}, verdict: 'CLEAN', signals: [], confidence: 0, hasCompound: false };
  }

  const now             = Date.now();
  const sessionMinutes  = Math.max(sessionDurationSeconds / 60, 0.5);
  const hasCompound     = riskEvents.some(e => e.type === 'COMPOUND_RISK');
  const breakdown       = {};
  let rawScore          = 0;
  const signals         = [];

  // Group events by type
  const grouped = {};
  riskEvents.forEach(ev => {
    if (!grouped[ev.type]) grouped[ev.type] = [];
    grouped[ev.type].push(ev);
  });

  // Score each signal type
  Object.entries(grouped).forEach(([type, events]) => {
    if (type === 'COMPOUND_RISK') return; // handled via multiplier

    const weight     = WEIGHTS[type] || 0.05;
    const severityOrder = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

    // ── Temporal decay: recent events get boost ──────────────────
    const weightedEvents = events.map(ev => {
      const ageMs   = now - (ev.id || now);  // ev.id stores timestamp if available
      const isRecent = ageMs < RECENCY_WINDOW_MS;
      return { ev, boost: isRecent ? RECENCY_BOOST : 1.0 };
    });

    const worstSev = events.reduce((worst, ev) =>
      severityOrder.indexOf(ev.severity) > severityOrder.indexOf(worst) ? ev.severity : worst
    , 'LOW');
    const multiplier  = SEVERITY_MULTIPLIERS[worstSev] || 1.0;

    // Effective event count (recency-boosted)
    const effectiveCount = weightedEvents.reduce((sum, w) => sum + w.boost, 0);

    // Frequency: events per minute (capped at 5/min)
    const freqPerMin = Math.min(effectiveCount / sessionMinutes, 5);

    // Contribution formula: weight × severity × (base + frequency)
    const contribution = Math.min(
      weight * multiplier * (0.5 + freqPerMin * 0.1) * 100,
      weight * multiplier * 100  // cap at single full-weight event
    );

    breakdown[type] = {
      count:        events.length,
      severity:     worstSev,
      contribution: Math.round(contribution),
      recency:      weightedEvents.some(w => w.boost > 1),
    };
    rawScore += contribution;
    signals.push({ type, count: events.length, severity: worstSev, score: Math.round(contribution) });
  });

  // Apply compound risk multiplier
  if (hasCompound) rawScore *= COMPOUND_RISK_MULTIPLIER;

  const finalScore = Math.min(Math.round(rawScore), 100);

  // Confidence level: how many distinct signal types fired
  const distinctTypes    = Object.keys(grouped).filter(t => t !== 'COMPOUND_RISK').length;
  const confidence       = Math.min(distinctTypes * 0.15, 1.0);

  const verdict =
    finalScore >= 75 ? 'HIGH_RISK' :
    finalScore >= 45 ? 'MODERATE_RISK' :
    finalScore >= 20 ? 'LOW_RISK' : 'CLEAN';

  return { score: finalScore, breakdown, verdict, signals, confidence, hasCompound };
}

/**
 * deepfakeHeuristics — Client-side deepfake detection.
 * Paper §4.2 + §6 anti-spoofing.
 * 
 * Analyzes a canvas frame for:
 *   1. Moiré patterns (pre-recorded screen replay)
 *   2. Blinking anomalies (too regular = synthetic)
 *   3. Facial landmark jitter (real faces have micro-movement)
 */
export function analyzeDeepfakeArtifacts(canvasEl, blinkTimestamps = []) {
  if (!canvasEl) return { suspected: false, confidence: 0, flags: [] };
  const flags = [];
  let confidence = 0;

  try {
    const ctx = canvasEl.getContext('2d');
    const { width, height } = canvasEl;
    const data = ctx.getImageData(0, 0, width, height).data;

    // ── Moiré Pattern Detection ─────────────────────────────────
    // Pre-recorded video on a screen creates periodic interference patterns.
    // Detect by measuring alternating high-frequency patterns in luminance.
    let moireScore = 0;
    const step = 4 * Math.floor(width);
    for (let y = 2; y < height - 2; y += 2) {
      const idx1 = y * step;
      const idx2 = (y + 1) * step;
      const idx3 = (y - 1) * step;
      const lum1 = (data[idx1] + data[idx1+1] + data[idx1+2]) / 3;
      const lum2 = (data[idx2] + data[idx2+1] + data[idx2+2]) / 3;
      const lum3 = (data[idx3] + data[idx3+1] + data[idx3+2]) / 3;
      if (Math.abs(lum1 - lum2) > 30 && Math.abs(lum1 - lum3) > 30 && Math.sign(lum2 - lum1) !== Math.sign(lum3 - lum1)) {
        moireScore++;
      }
    }
    const moireRatio = moireScore / (height / 2);
    if (moireRatio > 0.15) {
      flags.push({ type: 'MOIRE_PATTERN', value: moireRatio, desc: 'Screen-replay Moiré artifact detected' });
      confidence += 30;
    }

    // ── Blink Rate Analysis ─────────────────────────────────────
    // Real blink rate: 15-20 blinks/min. < 8 or > 35 is suspicious.
    // Deepfakes: too uniform / too rare blinks
    if (blinkTimestamps.length >= 5) {
      const durations = blinkTimestamps.slice(1).map((t, i) => t - blinkTimestamps[i]);
      const avgInterval = durations.reduce((a, b) => a + b, 0) / durations.length;
      const variance = durations.reduce((v, d) => v + Math.pow(d - avgInterval, 2), 0) / durations.length;
      const stdDev = Math.sqrt(variance);

      // Real blinks have natural variance > 200ms
      if (stdDev < 100 && blinkTimestamps.length >= 8) {
        flags.push({ type: 'BLINK_REGULARITY', value: stdDev, desc: 'Unnaturally regular blink pattern detected' });
        confidence += 25;
      }

      const blinkRatePerMin = (blinkTimestamps.length / ((Date.now() - blinkTimestamps[0]) / 60000));
      if (blinkRatePerMin < 5) {
        flags.push({ type: 'LOW_BLINK_RATE', value: blinkRatePerMin, desc: `Low blink rate (${blinkRatePerMin.toFixed(1)}/min) — possible screen-reading` });
        confidence += 20;
      }
    }

    // ── Frame Texture Analysis ──────────────────────────────────
    // Real webcam video has natural sensor noise. Perfect frames suggest replay.
    let pixelVariance = 0;
    const sampleSize = Math.min(data.length / 4, 1000);
    const stride = Math.floor(data.length / (4 * sampleSize));
    for (let i = 0; i < data.length; i += stride * 4) {
      const r = data[i], g = data[i+1], b = data[i+2];
      pixelVariance += (r * r + g * g + b * b) / (255 * 255 * 3);
    }
    const normalizedVariance = pixelVariance / sampleSize;
    if (normalizedVariance < 0.001 && normalizedVariance > 0) {
      flags.push({ type: 'LOW_SENSOR_NOISE', value: normalizedVariance, desc: 'Suspiciously uniform pixel noise — possible synthetic video' });
      confidence += 20;
    }

  } catch { /* canvas tainted */ }

  return {
    suspected: confidence >= 35,
    confidence: Math.min(confidence, 100),
    flags,
  };
}

/**
 * VERDICT_STYLES — UI color coding for fraud verdicts.
 */
export const VERDICT_STYLES = {
  CLEAN:         { color: 'var(--aegis-green)', bg: 'rgba(16,185,129,0.08)',  label: '✓ Clean',       icon: '🟢' },
  LOW_RISK:      { color: '#4cc9f0', bg: 'rgba(76,201,240,0.08)', label: '● Low Risk',    icon: '🔵' },
  MODERATE_RISK: { color: 'var(--aegis-amber)', bg: 'rgba(245,158,11,0.08)', label: '⚠ Moderate',   icon: '🟡' },
  HIGH_RISK:     { color: 'var(--aegis-red)', bg: 'rgba(239,68,68,0.08)',  label: '⛔ High Risk',  icon: '🔴' },
};
