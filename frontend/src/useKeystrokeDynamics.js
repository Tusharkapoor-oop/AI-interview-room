/**
 * useKeystrokeDynamics.js — Paper 2 §"Continuous User Verification"
 *                           Paper 3 §"Behavioral Biometrics"
 *
 * Implements keystroke dynamics continuous authentication:
 *   - Dwell time (how long each key is held)
 *   - Flight time (gap between consecutive keys)
 *   - Typing rhythm profile
 *   - Statistical deviation from enrolled baseline
 *   - Identifies: too-fast uniform typing (AI), very slow (coached), paste after long silence
 *
 * Paper: "a fused approach achieved 99.12% accuracy in continuously verifying user identity"
 * Paper: "combining face recognition with keystroke dynamics and touch-screen interactions"
 */
import { useEffect, useRef, useCallback } from 'react';
import { useAegisStore } from './useAegisStore';

const PROFILE_WINDOW = 50;        // keystrokes to build baseline
const CHECK_WINDOW   = 20;        // keystrokes for ongoing comparison
const DEVIATION_THRESHOLD = 2.5;  // standard deviations before flagging

export function useKeystrokeDynamics(enabled = true, onBaselineBuilt = null) {
  const { phase, addRiskEvent, updateIntegrityScore, showToast } = useAegisStore();

  // Keystroke feature buffers
  const dwellTimes   = useRef([]);  // key hold durations (ms)
  const flightTimes  = useRef([]);  // inter-key gaps (ms)
  const pressTimestamps = useRef({}); // keyCode → timestamp pressed
  const lastKeyTime  = useRef(null);

  // Baseline profile (established from first PROFILE_WINDOW keystrokes)
  const baseline     = useRef(null);
  const profileBuilt = useRef(false);
  const deviationCount = useRef(0);

  // Response latency tracking (question shown → first keystroke)
  const questionShownAt = useRef(null);
  const firstKeyAfterQuestion = useRef(true);

  const buildProfile = (dwells, flights) => {
    const mean  = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const std   = arr => {
      const m = mean(arr);
      return Math.sqrt(arr.reduce((v, x) => v + (x - m) ** 2, 0) / arr.length);
    };
    return {
      dwellMean: mean(dwells),
      dwellStd:  std(dwells),
      flightMean: mean(flights),
      flightStd: std(flights),
      rhythm: mean(dwells) / Math.max(mean(flights), 1),
    };
  };

  const detectAnomaly = (recent) => {
    if (!baseline.current || recent.dwells.length < CHECK_WINDOW) return null;
    const b = baseline.current;

    // Z-score deviation from baseline
    const recentDwellMean = recent.dwells.reduce((a, b) => a + b, 0) / recent.dwells.length;
    const recentFlightMean = recent.flights.reduce((a, b) => a + b, 0) / recent.flights.length;

    const dwellZ  = b.dwellStd > 0 ? Math.abs(recentDwellMean - b.dwellMean) / b.dwellStd : 0;
    const flightZ = b.flightStd > 0 ? Math.abs(recentFlightMean - b.flightMean) / b.flightStd : 0;

    const combinedZ = (dwellZ + flightZ) / 2;

    if (combinedZ > DEVIATION_THRESHOLD) {
      deviationCount.current++;
      if (deviationCount.current >= 2) {
        deviationCount.current = 0;
        return {
          type: combinedZ > 5 ? 'POSSIBLE_DIFFERENT_TYPIST' : 'TYPING_PATTERN_SHIFT',
          severity: combinedZ > 5 ? 'HIGH' : 'MEDIUM',
          desc: `Keystroke dynamics deviate significantly from baseline (z=${combinedZ.toFixed(1)}). ` +
                `Dwell Δ${dwellZ.toFixed(1)}σ, Flight Δ${flightZ.toFixed(1)}σ. ` +
                `Possible different typist or assisted input.`,
          confidence: Math.min((combinedZ - DEVIATION_THRESHOLD) / 3, 1.0),
        };
      }
    } else {
      deviationCount.current = Math.max(0, deviationCount.current - 1);
    }
    return null;
  };

  const handleKeyDown = useCallback((e) => {
    if (!enabled || phase !== 'interview') return;
    const now = Date.now();
    pressTimestamps.current[e.code] = now;

    // Response latency: first key after new question
    if (firstKeyAfterQuestion.current && questionShownAt.current !== null) {
      const latency = now - questionShownAt.current;
      firstKeyAfterQuestion.current = false;
      // Very fast response < 500ms → suspected pre-typed / AI
      if (latency >= 0 && latency < 500) {
        addRiskEvent({
          type:     'RESPONSE_LATENCY_ANOMALY',
          severity: 'MEDIUM',
          desc:     `Unusually fast response: ${latency}ms after question display. Possible AI-generated or pre-typed answer.`,
        });
      }
    }

    // Flight time (time since last keypress)
    if (lastKeyTime.current !== null) {
      const flight = now - lastKeyTime.current;
      if (flight < 5000) { // ignore very long pauses (user thinking)
        flightTimes.current.push(flight);
        if (flightTimes.current.length > 200) flightTimes.current.shift();
      }
    }
    lastKeyTime.current = now;
  }, [enabled, phase, addRiskEvent]);

  const handleKeyUp = useCallback((e) => {
    if (!enabled || phase !== 'interview') return;
    const now = Date.now();
    const pressed = pressTimestamps.current[e.code];
    if (!pressed) return;

    const dwell = now - pressed;
    delete pressTimestamps.current[e.code];

    if (dwell > 0 && dwell < 2000) {
      dwellTimes.current.push(dwell);
      if (dwellTimes.current.length > 200) dwellTimes.current.shift();
    }

    // Build baseline from first PROFILE_WINDOW keystrokes
    if (!profileBuilt.current && dwellTimes.current.length >= PROFILE_WINDOW && flightTimes.current.length >= PROFILE_WINDOW) {
      const built = buildProfile(
        dwellTimes.current.slice(0, PROFILE_WINDOW),
        flightTimes.current.slice(0, PROFILE_WINDOW)
      );
      baseline.current = built;
      profileBuilt.current = true;
      if (onBaselineBuilt) {
        onBaselineBuilt(built);
      }
    }

    // Ongoing anomaly detection after baseline is built
    if (profileBuilt.current && dwellTimes.current.length % CHECK_WINDOW === 0) {
      const recentDwells  = dwellTimes.current.slice(-CHECK_WINDOW);
      const recentFlights = flightTimes.current.slice(-CHECK_WINDOW);
      const anomaly = detectAnomaly({ dwells: recentDwells, flights: recentFlights });
      if (anomaly) {
        addRiskEvent(anomaly);
        updateIntegrityScore();
        showToast('⌨ Typing pattern anomaly detected.', 'warn', 4000);
      }
    }
  }, [enabled, phase, addRiskEvent, updateIntegrityScore, showToast]);

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup',   handleKeyUp);

    // Periodic cleanup of stale press timestamps (> 60s old)
    const cleanupTimer = setInterval(() => {
      const now = Date.now();
      const stale = [];
      for (const [code, ts] of Object.entries(pressTimestamps.current)) {
        if (now - ts > 60000) stale.push(code);
      }
      stale.forEach(code => delete pressTimestamps.current[code]);
    }, 30000);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup',   handleKeyUp);
      clearInterval(cleanupTimer);
      pressTimestamps.current = {};
    };
  }, [enabled, handleKeyDown, handleKeyUp]);

  // Allow interview arena to signal new question shown
  return {
    markQuestionShown: () => {
      questionShownAt.current = Date.now();
      firstKeyAfterQuestion.current = true;
    },
    getProfile: () => baseline.current,
    isProfileBuilt: () => profileBuilt.current,
  };
}
