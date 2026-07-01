/**
 * useSpeakerVerification.js — Browser-Native Speaker Verification
 *
 * Paper §"Auditory Forensics":
 *   "Methods like Gaussian Mixture Models with Universal Background Models (GMM-UBM)
 *    or i-vector based systems can create a unique vocal signature of the candidate
 *    and compare it against any other voices detected in the audio stream."
 *
 * Browser-native implementation using Web Audio API:
 *   - Extracts 13 spectral features (MFCC-proxy: frequency-bin averages across the
 *     voice range 80Hz–8kHz) from candidate speech during calibration enrollment
 *   - During interview, computes the same features live every 20 seconds
 *   - Cosine similarity between enrolled profile and live features → match score
 *   - If match score drops below threshold (0.72) during active speech → VOICE_MISMATCH flag
 *
 * Why cosine similarity for voice:
 *   Voice spectral envelopes are direction vectors in frequency space.
 *   Same speaker → similar direction regardless of volume changes.
 *   Different speaker → statistically different direction vector.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useAegisStore } from './useAegisStore';

// ── Constants ────────────────────────────────────────────────────────────────
const FFT_SIZE        = 2048;      // frequency resolution
const ENROLLMENT_MS   = 8000;      // capture 8s of speech for enrollment
const CHECK_INTERVAL  = 20000;     // verify voice every 20 seconds
const FEATURE_BINS    = 13;        // MFCC-proxy feature count
const MATCH_THRESHOLD = 0.72;      // cosine similarity threshold
const ENERGY_THRESHOLD = 0.08;     // skip verification if candidate is silent

// Frequency bands for 13 MFCC-proxy bins (log-spaced 80Hz–8kHz at 44100 sample rate)
// Maps FFT bins to perceptual frequency bands
function getFeatureBinRanges(fftSize, sampleRate) {
  const nyquist = sampleRate / 2;
  const minHz = 80, maxHz = Math.min(8000, nyquist);
  const logMin = Math.log(minHz), logMax = Math.log(maxHz);
  const ranges = [];
  for (let i = 0; i < FEATURE_BINS; i++) {
    const lo = Math.exp(logMin + (i     / FEATURE_BINS) * (logMax - logMin));
    const hi = Math.exp(logMin + ((i+1) / FEATURE_BINS) * (logMax - logMin));
    const loBin = Math.floor(lo / nyquist * (fftSize / 2));
    const hiBin = Math.ceil(hi  / nyquist * (fftSize / 2));
    ranges.push([Math.max(1, loBin), Math.min(fftSize / 2 - 1, hiBin)]);
  }
  return ranges;
}

/** Extract 13-bin spectral feature vector from FFT frequency data */
function extractFeatures(freqData, binRanges) {
  const features = new Float32Array(FEATURE_BINS);
  for (let i = 0; i < FEATURE_BINS; i++) {
    const [lo, hi] = binRanges[i];
    let sum = 0, count = 0;
    for (let b = lo; b <= hi; b++) {
      sum += freqData[b];
      count++;
    }
    features[i] = count > 0 ? sum / count : 0;
  }
  return features;
}

/** Cosine similarity between two Float32Array feature vectors */
function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom > 0 ? dot / denom : 0;
}

/** Compute RMS energy from time domain data (detect speech vs silence) */
function computeEnergy(timeDomainData) {
  let sum = 0;
  for (let i = 0; i < timeDomainData.length; i++) {
    const s = timeDomainData[i] / 128.0 - 1.0;
    sum += s * s;
  }
  return Math.sqrt(sum / timeDomainData.length);
}

// ── Main Hook ────────────────────────────────────────────────────────────────
export function useSpeakerVerification(enabled = false) {
  const {
    phase, voiceProfile, setVoiceProfile,
    setSpeakerMatchScore, addRiskEvent,
    updateIntegrityScore, showToast, relaxedProctoringEnabled,
  } = useAegisStore();

  const [enrollmentState, setEnrollmentState] = useState('idle'); // idle | recording | done | error
  const [enrollProgress, setEnrollProgress]   = useState(0);
  const [localMatchScore, setLocalMatchScore]  = useState(null);

  const audioCtxRef    = useRef(null);
  const analyserRef    = useRef(null);
  const streamRef      = useRef(null);
  const binRangesRef   = useRef(null);
  const checkTimerRef  = useRef(null);
  const mismatchCount  = useRef(0);
  const flaggedRef     = useRef(false);
  const enrollBuffers  = useRef([]); // accumulated feature vectors during enrollment

  // Initialize audio context + analyser
  const initAudio = useCallback(async () => {
    if (audioCtxRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      audioCtxRef.current = new AudioContext();
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = FFT_SIZE;
      analyserRef.current.smoothingTimeConstant = 0.3;
      audioCtxRef.current.createMediaStreamSource(stream).connect(analyserRef.current);
      binRangesRef.current = getFeatureBinRanges(FFT_SIZE, audioCtxRef.current.sampleRate);
      return true;
    } catch {
      return false;
    }
  }, []);

  /** Get current spectral feature vector (returns null if silent) */
  const getCurrentFeatures = useCallback(() => {
    if (!analyserRef.current || !binRangesRef.current) return null;
    const freqData  = new Uint8Array(analyserRef.current.frequencyBinCount);
    const timeData  = new Uint8Array(analyserRef.current.fftSize);
    analyserRef.current.getByteFrequencyData(freqData);
    analyserRef.current.getByteTimeDomainData(timeData);
    const energy = computeEnergy(timeData);
    if (energy < ENERGY_THRESHOLD) return null; // silent
    return { features: extractFeatures(freqData, binRangesRef.current), energy };
  }, []);

  // ── Phase A: Voice Enrollment ─────────────────────────────────────────────
  const startEnrollment = useCallback(async () => {
    const ok = await initAudio();
    if (!ok) {
      setEnrollmentState('error');
      return;
    }
    setEnrollmentState('recording');
    setEnrollProgress(0);
    enrollBuffers.current = [];
    flaggedRef.current = false;

    const startTime = Date.now();
    const captureId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setEnrollProgress(Math.min(elapsed / ENROLLMENT_MS, 1));

      const sample = getCurrentFeatures();
      if (sample) {
        enrollBuffers.current.push(sample.features);
      }

      if (elapsed >= ENROLLMENT_MS) {
        clearInterval(captureId);

        if (enrollBuffers.current.length < 5) {
          setEnrollmentState('error');
          return;
        }

        // Build voice profile: mean of all enrolled feature vectors
        const profile = new Float32Array(FEATURE_BINS);
        for (const vec of enrollBuffers.current) {
          for (let i = 0; i < FEATURE_BINS; i++) {
            profile[i] += vec[i];
          }
        }
        for (let i = 0; i < FEATURE_BINS; i++) {
          profile[i] /= enrollBuffers.current.length;
        }

        setVoiceProfile(Array.from(profile));
        setEnrollmentState('done');
        setEnrollProgress(1);
      }
    }, 150);
  }, [initAudio, getCurrentFeatures, setVoiceProfile]);

  // ── Phase B: Live Verification ────────────────────────────────────────────
  const verifyLive = useCallback(() => {
    if (!voiceProfile || !analyserRef.current || relaxedProctoringEnabled) return;

    const sample = getCurrentFeatures();
    if (!sample) return; // silent — no verification needed

    const profileVec = new Float32Array(voiceProfile);
    const similarity = cosineSimilarity(sample.features, profileVec);
    const matchScore = Math.round(similarity * 100);

    setLocalMatchScore(matchScore);
    setSpeakerMatchScore?.(matchScore);

    if (similarity < MATCH_THRESHOLD) {
      mismatchCount.current++;
      if (mismatchCount.current >= 2 && !flaggedRef.current) {
        flaggedRef.current = true;
        addRiskEvent({
          type: 'VOICE_MISMATCH',
          severity: 'HIGH',
          desc: `Speaker verification failed — voice mismatch detected (similarity=${matchScore}%, threshold=${Math.round(MATCH_THRESHOLD * 100)}%). Possible voice substitution or coaching.`,
        });
        updateIntegrityScore();
        showToast('🎤 Voice mismatch detected — speaker identity unconfirmed.', 'error', 8000);
      }
    } else {
      mismatchCount.current = Math.max(0, mismatchCount.current - 1);
      if (mismatchCount.current === 0) flaggedRef.current = false;
    }
  }, [voiceProfile, getCurrentFeatures, setSpeakerMatchScore, addRiskEvent,
      updateIntegrityScore, showToast, relaxedProctoringEnabled]);

  // ── Mount live verification loop ─────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'interview' || !enabled || !voiceProfile) return;

    initAudio().then(ok => {
      if (!ok) return;
      // Initial verification after 10s (allow audio to stabilize)
      const initTimer = setTimeout(() => {
        verifyLive();
        checkTimerRef.current = setInterval(verifyLive, CHECK_INTERVAL);
      }, 10000);

      return () => {
        clearTimeout(initTimer);
        clearInterval(checkTimerRef.current);
      };
    });

    return () => {
      clearInterval(checkTimerRef.current);
    };
  }, [phase, enabled, voiceProfile, verifyLive, initAudio]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioCtxRef.current?.close();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return {
    startEnrollment,
    enrollmentState,
    enrollProgress,
    matchScore: localMatchScore,
    isEnrolled: !!voiceProfile,
  };
}
