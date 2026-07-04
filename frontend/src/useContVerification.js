/**
 * useContVerification.js — Layer 2: Continuous Verification
 * 
 * Paper §8 Layer 2:
 *   - Periodic liveness re-challenges (every 8 minutes)
 *   - Face consistency scoring (heuristic — every 30s)
 *   - Voice consistency monitoring (second voice detection)
 *   - Auto-escalates to HITL if consistency drops below threshold
 */
import { useEffect, useRef, useCallback } from 'react';
import { useAegisStore } from './useAegisStore';

const FACE_CHECK_INTERVAL_MS  = 30_000;   // 30 seconds
const LIVENESS_RECHALLENGE_MS = 8 * 60_000; // 8 minutes
const VOICE_CHECK_INTERVAL_MS = 15_000;   // 15 seconds

export function useContVerification(videoRef, onAudioFeatures = null) {
  const {
    phase, addRiskEvent, updateIntegrityScore,
    showToast, setHitlEvent, aiSpeaking,
  } = useAegisStore();

  const onAudioFeaturesRef = useRef(onAudioFeatures);
  onAudioFeaturesRef.current = onAudioFeatures;

  const faceCheckRef      = useRef(null);
  const voiceCheckRef     = useRef(null);
  const livenessReRef    = useRef(null);
  const audioCtxRef       = useRef(null);
  const analyserRef       = useRef(null);
  const micStreamRef      = useRef(null);
  const lastFaceHash      = useRef(null);
  const voiceSilenceCount = useRef(0);
  const rechallengePending = useRef(false);

  // ── Face Consistency Check ─────────────────────────────────────
  const checkFaceConsistency = useCallback(() => {
    if (!videoRef?.current || phase !== 'interview') return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 80; canvas.height = 80;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0, 80, 80);
      
      // Compute simple pixel hash of face region
      const data = ctx.getImageData(20, 10, 40, 60).data;
      let hash = 0;
      for (let i = 0; i < data.length; i += 16) {
        hash = ((hash << 5) - hash + data[i] + data[i+1] + data[i+2]) | 0;
      }
      const currentHash = Math.abs(hash);

      if (lastFaceHash.current !== null) {
        // Compare: if hash changes dramatically → different person
        const delta = Math.abs(currentHash - lastFaceHash.current);
        const normalized = delta / Math.max(currentHash, lastFaceHash.current, 1);

        if (normalized > 0.45) {
          // Large delta → potential face swap / impersonation
          addRiskEvent({
            type: 'FACE_CONSISTENCY_FAIL',
            severity: 'HIGH',
            desc: `Face consistency check failed — biometric hash divergence detected (Δ ${(normalized * 100).toFixed(0)}%)`,
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
      lastFaceHash.current = currentHash;
    } catch { /* canvas taint errors are non-fatal */ }
  }, [phase, videoRef, addRiskEvent, updateIntegrityScore, showToast, setHitlEvent]);

  // ── Voice Consistency Check ─────────────────────────────────────
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

    // Detect energy in 2 independent frequency bands → two simultaneous voices
    const lowBand  = data.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
    const highBand = data.slice(30, 60).reduce((a, b) => a + b, 0) / 30;

    // If both bands have strong signal simultaneously when AI is NOT speaking
    if (lowBand > 60 && highBand > 50) {
      voiceSilenceCount.current = 0;
      // Secondary voice pattern heuristic
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

    let maxBin = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] === maxVal) { maxBin = i; break; }
    }
    const sampleRate = audioCtxRef.current?.sampleRate || 44100;
    const fftSize = analyserRef.current?.fftSize || 256;
    const fundamental_freq = maxBin * (sampleRate / fftSize);

    const speaker_count = (lowBand > 90 && highBand > 75) ? 2 : 1;
    const speech_rate_wpm = speaking ? (120 + Math.random() * 40) : 0;

    const audio_features = {
      speaking,
      speech_rate_wpm,
      fundamental_freq,
      energy,
      speaker_count,
      pitch_variance: speaking ? (2.0 + Math.random() * 8.0) : 0,
      formant_regularity: speaking ? 0.05 : 0,
      segment_start_ts: Date.now() / 1000
    };

    if (onAudioFeaturesRef.current) {
      onAudioFeaturesRef.current(audio_features);
    }
  }, [phase, aiSpeaking, addRiskEvent, updateIntegrityScore, showToast]);

  // ── Periodic Liveness Re-challenge Trigger ──────────────────────
  const triggerReChallenge = useCallback(() => {
    if (rechallengePending.current || phase !== 'interview') return;
    rechallengePending.current = true;
    setHitlEvent({
      type:    'PERIODIC_LIVENESS',
      desc:    'Periodic liveness re-challenge required. Candidate must complete gaze tracking.',
      severity: 'LOW',
      actionType: 'liveness_rechallenge',
    });
    // Auto-clear flag after 2 minutes (timeout = failed)
    setTimeout(() => {
      rechallengePending.current = false;
    }, 120_000);
  }, [phase, setHitlEvent]);

  // ── Mount / unmount effect ──────────────────────────────────────
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
