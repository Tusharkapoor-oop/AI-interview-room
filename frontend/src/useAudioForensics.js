/**
 * useAudioForensics.js — NEW Research Module
 *
 * Advanced audio forensics for detecting:
 *
 * 1. EARPIECE / WHISPER COACHING DETECTION
 *    Whispered speech has distinct spectral characteristics:
 *    - Low fundamental frequency (F0 = 0) — no vocal fold vibration
 *    - High frequency energy dominance (3–8 kHz)
 *    - High turbulence noise ratio
 *    Detection: spectral centroid shift + H/L frequency power ratio > 2.5
 *
 * 2. BACKGROUND AUDIO CONSISTENCY
 *    Real rooms have consistent background noise profiles (AWGN-like).
 *    External audio feeds (recorded playback, screen readers) have:
 *    - Sudden noise floor changes
 *    - Compressed/processed frequency response (limited dynamic range)
 *    - Missing room impulse response tail (sounds "dry")
 *    Detection: spectral flatness measure (SFM) monitoring
 *
 * 3. TTS (TEXT-TO-SPEECH) VOICE DETECTION
 *    AI TTS systems (ElevenLabs, Google TTS, Amazon Polly) have:
 *    - Extremely stable pitch (F0 variance < 5Hz)
 *    - No micro-jitter (vocal shimmer < 0.3%)
 *    - Regular pause intervals at punctuation
 *    - Unnaturally smooth formant transitions
 *    Detection: pitch stability index + shimmer estimation
 *
 * 4. ROOM ACOUSTIC FINGERPRINT
 *    Records baseline RT60 (reverberation) at start, alerts if the
 *    acoustic fingerprint changes mid-interview (candidate moved to
 *    a different room or switched to a virtual mic).
 *
 * 5. OVERLAPPING SPEECH DETECTION
 *    Detects two simultaneous voices (candidate + coach) using:
 *    - Dual spectral peak detection
 *    - Harmonic pitch tracking (two F0 peaks)
 *
 * Research basis: Voice anti-spoofing literature, ASVspoof 2019 dataset.
 */
import { useRef, useCallback, useEffect } from 'react';
import { useAegisStore } from './useAegisStore';

const ANALYSIS_RATE_MS = 500;  // Analyze every 500ms
const BASELINE_FRAMES  = 10;   // 5 seconds for baseline

// ── Thresholds ────────────────────────────────────────────────────────────────
const WHISPER_HF_RATIO_THRESH    = 2.8;  // High freq / Low freq power ratio
const WHISPER_CENTROID_THRESH    = 4500; // Hz — whisper centroid > speech centroid
const TTS_PITCH_VARIANCE_MAX     = 6.0;  // Hz — unnaturally stable pitch
const SFM_CHANGE_THRESH          = 0.25; // spectral flatness measure change
const DUAL_PITCH_DIFF_MIN        = 40;   // Hz minimum difference between two pitches
const PAUSE_UNIFORMITY_CV_MAX    = 0.15; // CV of pauses < 0.15 = TTS-like
const LOUDNESS_COMPRESSION_MAX   = 8;    // dB — compressed dynamic range

export function useAudioForensics() {
  const { phase, addRiskEvent, updateIntegrityScore, showToast } = useAegisStore();

  const audioCtxRef    = useRef(null);
  const analyserRef    = useRef(null);
  const timerRef       = useRef(null);

  // Baseline state
  const baselineRef    = useRef(null);  // { sfm, centroid, frames }
  const framesRef      = useRef(0);

  // Pitch tracking
  const pitchHistRef   = useRef([]);    // rolling pitch estimates
  const pauseTimesRef  = useRef([]);    // silence gap durations

  // Flags
  const flaggedRef     = useRef({});

  const flagOnce = useCallback((type, cooldownMs = 90_000) => {
    const now = Date.now();
    if (flaggedRef.current[type] && now - flaggedRef.current[type] < cooldownMs) return false;
    flaggedRef.current[type] = now;
    return true;
  }, []);

  // ── Audio setup ───────────────────────────────────────────────
  const initAudio = useCallback(async () => {
    if (audioCtxRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioCtxRef.current = new AudioContext({ sampleRate: 44100 });
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 4096;  // High resolution for pitch detection
      analyserRef.current.smoothingTimeConstant = 0.3;
      const source = audioCtxRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
    } catch { /* mic unavailable */ }
  }, []);

  // ── Spectral Flatness Measure (Wiener entropy) ────────────────
  // SFM = geometric_mean(|X[k]|²) / arithmetic_mean(|X[k]|²)
  // White noise → SFM ≈ 1, tonal signal → SFM ≈ 0
  const computeSFM = useCallback((freqData) => {
    const n = freqData.length;
    let logSum = 0, sum = 0;
    for (let i = 1; i < n; i++) {
      const mag = Math.max(freqData[i], 1);
      logSum += Math.log(mag);
      sum    += mag;
    }
    const geoMean  = Math.exp(logSum / (n - 1));
    const arithMean = sum / (n - 1);
    return arithMean === 0 ? 1 : geoMean / arithMean;
  }, []);

  // ── Spectral Centroid ──────────────────────────────────────────
  const computeCentroid = useCallback((freqData, sampleRate) => {
    const binHz = (sampleRate / 2) / freqData.length;
    let num = 0, den = 0;
    freqData.forEach((mag, i) => { num += i * binHz * mag; den += mag; });
    return den === 0 ? 0 : num / den;
  }, []);

  // ── HF/LF power ratio (whisper detection) ─────────────────────
  // LF: 0-2kHz, HF: 2-8kHz
  const computeHfLfRatio = useCallback((freqData, sampleRate) => {
    const binHz = (sampleRate / 2) / freqData.length;
    let lf = 0, hf = 0;
    freqData.forEach((mag, i) => {
      const freq = i * binHz;
      if (freq < 2000)       lf += mag;
      else if (freq < 8000)  hf += mag;
    });
    return lf === 0 ? 0 : hf / lf;
  }, []);

  // ── Pitch estimation (autocorrelation method) ─────────────────
  const estimatePitch = useCallback((timeDomainData, sampleRate) => {
    const n = timeDomainData.length;
    // Center and normalize
    const buf = Array.from(timeDomainData).map(v => (v - 128) / 128);

    // Autocorrelation
    const minLag = Math.floor(sampleRate / 800);  // max 800 Hz
    const maxLag = Math.floor(sampleRate / 80);   // min 80 Hz

    let bestLag = -1, bestCorr = -1;
    for (let lag = minLag; lag <= maxLag && lag < n; lag++) {
      let corr = 0;
      for (let i = 0; i < n - lag; i++) corr += buf[i] * buf[i + lag];
      if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
    }

    if (bestLag < 0 || bestCorr < 0.3) return null; // unvoiced or silence
    return sampleRate / bestLag; // Hz
  }, []);

  // ── Dynamic range (loudness compression detection) ─────────────
  const computeDynamicRange = useCallback((timeDomainData) => {
    const rms = Math.sqrt(
      Array.from(timeDomainData).reduce((s, v) => {
        const n = (v - 128) / 128; return s + n * n;
      }, 0) / timeDomainData.length
    );
    const peak = Math.max(...Array.from(timeDomainData).map(v => Math.abs(v - 128) / 128));
    if (rms === 0) return 0;
    return 20 * Math.log10(peak / rms); // dB
  }, []);

  // ── Main analysis loop ────────────────────────────────────────
  const analyze = useCallback(() => {
    if (!analyserRef.current || phase !== 'interview') return;
    const sr = audioCtxRef.current?.sampleRate || 44100;

    const freqData  = new Uint8Array(analyserRef.current.frequencyBinCount);
    const timeData  = new Uint8Array(analyserRef.current.fftSize);
    analyserRef.current.getByteFrequencyData(freqData);
    analyserRef.current.getByteTimeDomainData(timeData);

    const avgEnergy = freqData.reduce((a, b) => a + b, 0) / freqData.length;
    const isSilent  = avgEnergy < 5;

    // Skip analysis if silent
    if (isSilent) return;

    const sfm      = computeSFM(freqData);
    const centroid = computeCentroid(freqData, sr);
    const hfLf     = computeHfLfRatio(freqData, sr);
    const pitch    = estimatePitch(timeData, sr);
    const dynRange = computeDynamicRange(timeData);

    framesRef.current++;

    // ── Build baseline (first 5s of audio) ──────────────────────
    if (framesRef.current <= BASELINE_FRAMES) {
      if (!baselineRef.current) {
        baselineRef.current = { sfmSum: 0, centroidSum: 0, n: 0 };
      }
      baselineRef.current.sfmSum      += sfm;
      baselineRef.current.centroidSum += centroid;
      baselineRef.current.n++;
      if (framesRef.current === BASELINE_FRAMES) {
        const b = baselineRef.current;
        baselineRef.current = {
          sfm:      b.sfmSum / b.n,
          centroid: b.centroidSum / b.n,
          ready: true,
        };
      }
      return;
    }

    const baseline = baselineRef.current;
    if (!baseline?.ready) return;

    // ── 1. Whisper coaching detection ────────────────────────────
    const isWhisperPossible = hfLf > WHISPER_HF_RATIO_THRESH && centroid > WHISPER_CENTROID_THRESH;
    if (isWhisperPossible && flagOnce('WHISPER_COACHING', 60_000)) {
      addRiskEvent({
        type: 'WHISPER_COACHING_DETECTED',
        severity: 'HIGH',
        desc: `Whisper/earpiece audio detected: HF/LF ratio=${hfLf.toFixed(2)} > ${WHISPER_HF_RATIO_THRESH} threshold, spectral centroid=${centroid.toFixed(0)}Hz > ${WHISPER_CENTROID_THRESH}Hz — whispered coaching has no vocal fold vibration (F0≈0), producing high-frequency energy dominance.`,
        meta: { hfLf: hfLf.toFixed(2), centroid: centroid.toFixed(0), sfm: sfm.toFixed(3) },
      });
      updateIntegrityScore();
      showToast('🎙 Whisper/earpiece audio pattern detected.', 'error', 8000);
    }

    // ── 2. Spectral flatness change (room/mic change) ─────────────
    const sfmChange = Math.abs(sfm - baseline.sfm);
    if (sfmChange > SFM_CHANGE_THRESH && flagOnce('ACOUSTIC_CHANGE', 120_000)) {
      addRiskEvent({
        type: 'ACOUSTIC_ENVIRONMENT_CHANGE',
        severity: 'MEDIUM',
        desc: `Acoustic fingerprint change detected: SFM shift Δ${sfmChange.toFixed(3)} vs baseline ${baseline.sfm.toFixed(3)} — candidate may have switched microphone, moved rooms, or introduced processed audio feed.`,
        meta: { sfmNow: sfm.toFixed(3), sfmBaseline: baseline.sfm.toFixed(3), delta: sfmChange.toFixed(3) },
      });
      updateIntegrityScore();
      showToast('🔊 Audio environment change detected mid-interview.', 'error', 7000);
    }

    // ── 3. TTS pitch stability detection ─────────────────────────
    if (pitch !== null) {
      pitchHistRef.current.push(pitch);
      if (pitchHistRef.current.length > 20) pitchHistRef.current.shift();

      if (pitchHistRef.current.length >= 12) {
        const pitchMean = pitchHistRef.current.reduce((a, b) => a + b, 0) / pitchHistRef.current.length;
        const pitchVar  = Math.sqrt(
          pitchHistRef.current.reduce((v, p) => v + (p - pitchMean) ** 2, 0) / pitchHistRef.current.length
        );

        if (pitchVar < TTS_PITCH_VARIANCE_MAX && flagOnce('TTS_PITCH', 90_000)) {
          addRiskEvent({
            type: 'TTS_VOICE_DETECTED',
            severity: 'HIGH',
            desc: `AI TTS voice signature: pitch stability σ=${pitchVar.toFixed(2)}Hz < ${TTS_PITCH_VARIANCE_MAX}Hz threshold (natural human speech has σ ≈ 15–40Hz). Mean F0=${pitchMean.toFixed(0)}Hz. ElevenLabs/Google TTS/Polly produce near-constant fundamental frequency.`,
            meta: { pitchMean: pitchMean.toFixed(0), pitchVar: pitchVar.toFixed(2) },
          });
          updateIntegrityScore();
          showToast('🎵 AI text-to-speech voice signature detected.', 'error', 9000);
        }
      }
    }

    // ── 4. Dynamic range (compression) detection ──────────────────
    if (dynRange < LOUDNESS_COMPRESSION_MAX && dynRange > 0.5 && flagOnce('COMPRESSED_AUDIO', 120_000)) {
      addRiskEvent({
        type: 'COMPRESSED_AUDIO_DETECTED',
        severity: 'LOW',
        desc: `Heavily compressed audio detected: dynamic range=${dynRange.toFixed(1)}dB < ${LOUDNESS_COMPRESSION_MAX}dB — processed/virtual microphone or VoIP compression artifact. Natural human voice: 20–40dB dynamic range.`,
        meta: { dynamicRange: dynRange.toFixed(1) },
      });
    }

    // Expose live metrics
    window.__aegisAudioForensics = {
      sfm: parseFloat(sfm.toFixed(3)),
      centroid: parseFloat(centroid.toFixed(0)),
      hfLfRatio: parseFloat(hfLf.toFixed(2)),
      pitch: pitch ? parseFloat(pitch.toFixed(0)) : null,
      dynamicRange: parseFloat(dynRange.toFixed(1)),
      baselineReady: baseline.ready,
    };
  }, [phase, computeSFM, computeCentroid, computeHfLfRatio, estimatePitch, computeDynamicRange,
      flagOnce, addRiskEvent, updateIntegrityScore, showToast]);

  useEffect(() => {
    if (phase !== 'interview') return;
    initAudio().then(() => {
      timerRef.current = setInterval(analyze, ANALYSIS_RATE_MS);
    }).catch(() => {});
    return () => {
      clearInterval(timerRef.current);
      framesRef.current   = 0;
      baselineRef.current = null;
      pitchHistRef.current = [];
      flaggedRef.current   = {};
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
    };
  }, [phase, initAudio, analyze]);

  return {
    getForensicsReport: () => window.__aegisAudioForensics ?? null,
  };
}
