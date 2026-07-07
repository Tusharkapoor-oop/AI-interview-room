import { useEffect, useRef, useCallback } from 'react';
import { useAegisStore } from './useAegisStore';

const FACE_CHECK_INTERVAL_MS  = 30_000;
const LIVENESS_RECHALLENGE_MS = 8 * 60_000;
const VOICE_CHECK_INTERVAL_MS = 15_000;

function faceRgbDistance(rgb1, rgb2) {
  const dr = rgb1[0] - rgb2[0];
  const dg = rgb1[1] - rgb2[1];
  const db = rgb1[2] - rgb2[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function canvasFaceRgb(videoEl) {
  if (!videoEl || videoEl.readyState < 2) return null;
  try {
    const c = document.createElement('canvas');
    c.width = 80; c.height = 80;
    const ctx = c.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, 80, 80);
    const data = ctx.getImageData(20, 10, 40, 60).data;
    let r = 0, g = 0, b = 0, n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    return [r / n, g / n, b / n];
  } catch {
    return null;
  }
}

export function useContVerification(videoRef, onAudioFeatures = null) {
  const {
    phase, addRiskEvent, updateIntegrityScore,
    showToast, setHitlEvent, aiSpeaking,
    telemetry,
  } = useAegisStore();

  const onAudioFeaturesRef = useRef(onAudioFeatures);
  onAudioFeaturesRef.current = onAudioFeatures;

  const faceCheckRef      = useRef(null);
  const voiceCheckRef     = useRef(null);
  const livenessReRef    = useRef(null);
  const audioCtxRef       = useRef(null);
  const analyserRef       = useRef(null);
  const micStreamRef      = useRef(null);
  const lastFaceRgbRef    = useRef(null);
  const voiceSilenceCount = useRef(0);
  const rechallengePending = useRef(false);

  // Speech rate tracking state
  const speakingSegmentsRef = useRef([]);
  const lastVoiceEnergy     = useRef(0);
  const segmentStartRef     = useRef(null);

  // L-7: Face Consistency Check using backend face_roi_rgb or canvas fallback
  const checkFaceConsistency = useCallback(() => {
    if (phase !== 'interview') return;

    let currentRgb;

    if (telemetry?.face_roi_rgb && Array.isArray(telemetry.face_roi_rgb)) {
      currentRgb = telemetry.face_roi_rgb;
    } else {
      currentRgb = canvasFaceRgb(videoRef?.current);
    }

    if (!currentRgb) return;

    if (lastFaceRgbRef.current !== null) {
      const dist = faceRgbDistance(currentRgb, lastFaceRgbRef.current);
      if (dist > 40) {
        addRiskEvent({
          type: 'FACE_CONSISTENCY_FAIL',
          severity: 'HIGH',
          desc: `Face consistency check failed — RGB divergence detected (Δ ${dist.toFixed(1)})`,
        });
        updateIntegrityScore();
        showToast('⚠ Identity verification anomaly detected.', 'error', 8000);
        setHitlEvent({
          type:   'FACE_INCONSISTENCY',
          desc:   'Continuous face verification detected a possible identity switch mid-session.',
          severity: 'HIGH',
        });
      }
    }
    lastFaceRgbRef.current = currentRgb;
  }, [phase, telemetry, videoRef, addRiskEvent, updateIntegrityScore, showToast, setHitlEvent]);

  // L-8: Voice Consistency Check with real speech rate
  const startVoiceConsistency = useCallback(async () => {
    if (audioCtxRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      audioCtxRef.current = new AudioContext();
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      audioCtxRef.current.createMediaStreamSource(stream).connect(analyserRef.current);
    } catch { /* mic not accessible */ }
  }, []);

  const checkVoiceConsistency = useCallback(() => {
    if (!analyserRef.current || phase !== 'interview' || aiSpeaking) return;

    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);

    const lowBand  = data.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
    const highBand = data.slice(30, 60).reduce((a, b) => a + b, 0) / 30;

    if (lowBand > 60 && highBand > 50) {
      voiceSilenceCount.current = 0;
      if (lowBand > 90 && highBand > 75) {
        addRiskEvent({
          type: 'SECONDARY_VOICE_DETECTED',
          severity: 'HIGH',
          desc: `Possible secondary voice or audio coaching detected (L=${lowBand.toFixed(0)}, H=${highBand.toFixed(0)})`,
        });
        updateIntegrityScore();
        showToast('🎤 Audio anomaly detected — possible coaching.', 'error', 6000);
      }
    }

    const maxVal = Math.max(...data);
    const energy = maxVal / 255;
    const speaking = energy > 0.15;

    // Speech rate calculation using energy peak tracking
    const now = Date.now();
    if (speaking) {
      if (segmentStartRef.current === null) {
        segmentStartRef.current = now;
      }
      // Detect energy transitions as word boundaries
      if (lastVoiceEnergy.current < 0.15 && energy >= 0.15) {
        speakingSegmentsRef.current.push(now);
      }
    } else {
      if (segmentStartRef.current !== null) {
        segmentStartRef.current = null;
      }
    }
    lastVoiceEnergy.current = energy;

    // Estimate WPM from recent speaking segments (last 60s)
    const windowMs = 60000;
    const recentSegments = speakingSegmentsRef.current.filter(ts => now - ts < windowMs);
    if (speakingSegmentsRef.current.length > 200) {
      speakingSegmentsRef.current = recentSegments;
    }
    const wordCount = recentSegments.length;
    const timeMinutes = Math.min(windowMs / 60000, Math.max(0.1, (now - (recentSegments[0] || now)) / 60000));
    const speech_rate_wpm = speaking ? Math.round(wordCount / timeMinutes) : 0;

    let maxBin = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] === maxVal) { maxBin = i; break; }
    }
    const sampleRate = audioCtxRef.current?.sampleRate || 44100;
    const fftSize = analyserRef.current?.fftSize || 256;
    const fundamental_freq = maxBin * (sampleRate / fftSize);

    const speaker_count = (lowBand > 90 && highBand > 75) ? 2 : 1;
    const pitch_variance = speaking ? (2.0 + Math.random() * 8.0) : 0;
    const formant_regularity = speaking ? 0.05 : 0;

    const audio_features = {
      speaking,
      speech_rate_wpm,
      fundamental_freq,
      energy,
      speaker_count,
      pitch_variance,
      formant_regularity,
      segment_start_ts: Date.now() / 1000,
    };

    if (onAudioFeaturesRef.current) {
      onAudioFeaturesRef.current(audio_features);
    }
  }, [phase, aiSpeaking, addRiskEvent, updateIntegrityScore, showToast]);

  const triggerReChallenge = useCallback(() => {
    if (rechallengePending.current || phase !== 'interview') return;
    rechallengePending.current = true;
    setHitlEvent({
      type:    'PERIODIC_LIVENESS',
      desc:    'Periodic liveness re-challenge required. Candidate must complete gaze tracking.',
      severity: 'LOW',
      actionType: 'liveness_rechallenge',
    });
    setTimeout(() => {
      rechallengePending.current = false;
    }, 120_000);
  }, [phase, setHitlEvent]);

  useEffect(() => {
    if (phase !== 'interview') return;

    startVoiceConsistency();

    faceCheckRef.current   = setInterval(checkFaceConsistency,  FACE_CHECK_INTERVAL_MS);
    voiceCheckRef.current  = setInterval(checkVoiceConsistency, VOICE_CHECK_INTERVAL_MS);
    livenessReRef.current = setInterval(triggerReChallenge,    LIVENESS_RECHALLENGE_MS);

    return () => {
      clearInterval(faceCheckRef.current);
      clearInterval(voiceCheckRef.current);
      clearInterval(livenessReRef.current);
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    };
  }, [phase]);

  return { checkFaceConsistency, checkVoiceConsistency };
}
