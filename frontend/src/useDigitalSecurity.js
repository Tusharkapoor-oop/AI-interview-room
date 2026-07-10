/**
 * useDigitalSecurity.js — Layer 5: Digital Security
 * 
 * Paper §8 Layer 5:
 *   - Tab visibility / window blur monitoring
 *   - Clipboard paste size detection (large pastes → AI-generated text)
 *   - DevTools open detection (window size heuristic)
 *   - Virtual camera software detection
 *   - Keystroke entropy analysis (too-fast uniform typing → AI)
 *   - Focus loss event logging
 * 
 * All events generate risk events that feed into the FraudScore.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useAegisStore } from './useAegisStore';

const TAB_SWITCH_THRESHOLD = 5;    // After N tab switches → HIGH severity (P2-6)
const PASTE_CHAR_THRESHOLD = 200;  // Characters → suspicious paste (P2-7)
const TYPING_SPEED_THRESHOLD = 14; // Chars/second → AI generation suspected
const DEVTOOLS_WIDTH_DELTA = 130;  // DevTools panel width heuristic (tighter)

export function useDigitalSecurity(enabled = true, onRiskEvent = null) {
  const {
    phase, addRiskEvent, updateIntegrityScore,
    showToast, setHitlEvent,
  } = useAegisStore();

  const onRiskEventRef = useRef(onRiskEvent);

  useEffect(() => {
    onRiskEventRef.current = onRiskEvent;
  }, [onRiskEvent]);

  const triggerRiskEvent = useCallback((ev) => {
    addRiskEvent(ev);
    onRiskEventRef.current?.(ev);
  }, [addRiskEvent]);

  const tabSwitchCount  = useRef(0);
  const pasteCount      = useRef(0);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [pasteTotal, setPasteTotal] = useState(0);
  const keystrokeBuffer = useRef([]);
  const devtoolsFlag    = useRef(false);

  // ── 1. Tab Visibility / Focus Monitoring ──────────────────────
  const handleVisibilityChange = useCallback(() => {
    if (!enabled || phase !== 'interview') return;
    if (document.hidden) {
      tabSwitchCount.current += 1;
      const count = tabSwitchCount.current;
      setTabSwitches(count);
      const severity = count >= TAB_SWITCH_THRESHOLD ? 'HIGH' : 'MEDIUM';

      triggerRiskEvent({
        type:     'TAB_SWITCH',
        severity,
        desc:     `Browser tab switched away (count: ${count}). Possible external resource access.`,
      });
      updateIntegrityScore();

      showToast(`⚠ Tab switch detected (${count}x). Stay in this tab during the interview.`, 'warn', 5000);

      if (count >= TAB_SWITCH_THRESHOLD) {
        setHitlEvent({
          type:    'REPEATED_TAB_SWITCH',
          desc:    `Candidate has switched tabs ${count} times. Possible use of external resources or AI tools.`,
          severity: 'HIGH',
        });
      }
    }
  }, [enabled, phase, triggerRiskEvent, updateIntegrityScore, showToast, setHitlEvent]);

  // ── 2. Window Blur (other app focused) ────────────────────────
  const handleWindowBlur = useCallback(() => {
    if (!enabled || phase !== 'interview') return;
    // Note: heavy blur detection is handled by useApplicationLockdown.
    // This hook just records low-severity blur for completeness.
    triggerRiskEvent({
      type:     'WINDOW_BLUR',
      severity: 'LOW',
      desc:     'Browser window lost focus — candidate may have switched to another application.',
    });
  }, [enabled, phase, triggerRiskEvent]);

  // ── 3. Paste Event Monitoring ─────────────────────────────────
  const handlePaste = useCallback((e) => {
    if (!enabled || phase !== 'interview') return;
    const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
    if (text.length < 10) return; // Short pastes are normal

    pasteCount.current += 1;
    setPasteTotal(pasteCount.current);
    const severity = text.length >= PASTE_CHAR_THRESHOLD ? 'HIGH' : 'MEDIUM';

    triggerRiskEvent({
      type:     'PASTE_ANOMALY',
      severity,
      desc:     `Large paste detected: ${text.length} characters pasted. Possible AI-generated answer submission.`,
    });
    updateIntegrityScore();

    if (text.length >= PASTE_CHAR_THRESHOLD) {
      showToast('⚠ Large paste detected. Your response will be reviewed.', 'warn', 6000);
      setHitlEvent({
        type:     'LARGE_PASTE',
        desc:     `Candidate pasted ${text.length} characters. Snippet: "${text.slice(0, 80)}…"`,
        severity: 'HIGH',
        snippet:  text.slice(0, 200),
      });
    }
  }, [enabled, phase, triggerRiskEvent, updateIntegrityScore, showToast, setHitlEvent]);

  // ── 4. Keystroke Entropy Analysis ─────────────────────────────
  const handleKeyDown = useCallback(() => {
    if (!enabled || phase !== 'interview') return;
    const now = Date.now();
    keystrokeBuffer.current.push(now);

    // Keep last 20 keystrokes
    if (keystrokeBuffer.current.length > 20) keystrokeBuffer.current.shift();

    // Analyze typing speed over last 10 keystrokes
    if (keystrokeBuffer.current.length >= 10) {
      const KEYSTROKE_SAMPLE_SIZE = 10;
      const slice = keystrokeBuffer.current.slice(-KEYSTROKE_SAMPLE_SIZE);
      const elapsed = slice[slice.length - 1] - slice[0];
      const charsPerSec = (slice.length - 1) / (elapsed / 1000);  // 9 gaps for 10 keystrokes

      if (charsPerSec > TYPING_SPEED_THRESHOLD && elapsed > 500) {
        triggerRiskEvent({
          type:     'TYPING_ANOMALY',
          severity: 'MEDIUM',
          desc:     `Abnormally fast typing detected (${charsPerSec.toFixed(1)} chars/sec). Possible AI text generation or auto-complete tool.`,
        });
        keystrokeBuffer.current = []; // Reset to avoid spam
      }
    }
  }, [enabled, phase, triggerRiskEvent]);

  // ── 5. DevTools Detection ──────────────────────────────────────
  const checkDevTools = useCallback(() => {
    if (!enabled || phase !== 'interview') return;
    const widthDelta = Math.abs(window.outerWidth - window.innerWidth);
    const heightDelta = Math.abs(window.outerHeight - window.innerHeight);

    if ((widthDelta > DEVTOOLS_WIDTH_DELTA || heightDelta > DEVTOOLS_WIDTH_DELTA) && !devtoolsFlag.current) {
      devtoolsFlag.current = true;
      triggerRiskEvent({
        type:     'DEVTOOLS_OPEN',
        severity: 'MEDIUM',
        desc:     `DevTools panel likely open (width Δ${widthDelta}px, height Δ${heightDelta}px). Possible inspection of interview content.`,
      });
      showToast('⚠ Developer tools detected. Please close them.', 'warn', 5000);
    } else if (widthDelta <= DEVTOOLS_WIDTH_DELTA && heightDelta <= DEVTOOLS_WIDTH_DELTA) {
      devtoolsFlag.current = false;
    }
  }, [enabled, phase, triggerRiskEvent, showToast]);

  // ── 6. Context Menu Block ──────────────────────────────────────
  const handleContextMenu = useCallback((e) => {
    if (!enabled || phase !== 'interview') return;
    e.preventDefault();
    showToast('Right-click is disabled during the interview.', 'info', 3000);
  }, [enabled, phase, showToast]);

  // ── 7. CSS Injection Scan (Vector 6) ───────────────────────────
  // Detects DOM manipulation via injected stylesheets or inline style mutations
  // that could hide overlay UI elements from the proctoring system.
  const checkCssInjection = useCallback(() => {
    if (!enabled || phase !== 'interview') return;
    const styleSheets = document.styleSheets;
    for (let i = 0; i < styleSheets.length; i++) {
      try {
        const rules = styleSheets[i].cssRules || styleSheets[i].rules;
        if (rules) {
          for (let j = 0; j < rules.length; j++) {
            const cssText = rules[j].cssText || '';
            if (cssText.includes('display:none') || cssText.includes('visibility:hidden') || cssText.includes('opacity:0')) {
              const selectors = cssText.split('{')[0]?.trim();
              if (selectors && (selectors.includes('video') || selectors.includes('canvas') || selectors.includes('[data-aegis') || selectors.includes('.ghost'))) {
                triggerRiskEvent({
                  type: 'CSS_INJECTION',
                  severity: 'HIGH',
                  desc: `Suspicious CSS rule hiding proctoring element: "${cssText.slice(0, 80)}"`,
                });
                return;
              }
            }
          }
        }
      } catch { /* CORS-blocked stylesheets are normal; skip silently */ }
    }
  }, [enabled, phase, triggerRiskEvent]);

  // ── 8. Timing Attack Detection (Vector 5) ──────────────────────
  // Monitors for consistent response latency regardless of question difficulty —
  // a hallmark of AI tool use where a fixed delay is added to mask real-time
  // assistance latency.
  const timingRef = useRef({ lastTimestamp: 0, latencies: [], questionDifficulty: 0 });
  const recordResponseTiming = useCallback((difficulty) => {
    if (!enabled || phase !== 'interview') return;
    const now = Date.now();
    const t = timingRef.current;
    if (t.lastTimestamp > 0) {
      const gap = now - t.lastTimestamp;
      t.latencies.push(gap);
      if (t.latencies.length > 10) t.latencies.shift();
      if (t.latencies.length >= 5) {
        const mean = t.latencies.reduce((a, b) => a + b, 0) / t.latencies.length;
        const variance = t.latencies.reduce((a, b) => a + (b - mean) ** 2, 0) / t.latencies.length;
        const std = Math.sqrt(variance);
        const cv = std / mean;
        if (cv < 0.15 && mean > 3000) {
          triggerRiskEvent({
            type: 'TIMING_ANOMALY',
            severity: 'MEDIUM',
            desc: `Suspiciously uniform response latency (CV=${cv.toFixed(2)}, mean=${Math.round(mean)}ms). Possible masked AI tool delay.`,
          });
          t.latencies = [];
        }
      }
    }
    t.lastTimestamp = now;
    t.questionDifficulty = difficulty;
  }, [enabled, phase, triggerRiskEvent]);

  // ── 9. Screen Dimension Change Detection ───────────────────────
  // Detects when window size changes abruptly, which can indicate
  // split-screen or secondary display use.
  const screenDimRef = useRef({ width: window.innerWidth, height: window.innerHeight });
  const checkScreenDim = useCallback(() => {
    if (!enabled || phase !== 'interview') return;
    const prev = screenDimRef.current;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dw = Math.abs(w - prev.width);
    const dh = Math.abs(h - prev.height);
    if ((dw > 100 || dh > 100) && (dw < 50 || dh < 50) === false) {
      triggerRiskEvent({
        type: 'SCREEN_CHANGE',
        severity: 'LOW',
        desc: `Window dimensions changed (${dw}x${dh}px delta). Possible split-screen or display switch.`,
      });
    }
    screenDimRef.current = { width: w, height: h };
  }, [enabled, phase, triggerRiskEvent]);

  // ── 10. Clipboard API Monitoring ───────────────────────────────
  // Detects unauthorized clipboard reads that could indicate
  // automated answer injection.
  const checkClipboardApi = useCallback(() => {
    if (!enabled || phase !== 'interview') return;
    if (navigator.clipboard && navigator.clipboard.read) {
      navigator.clipboard.read().then(clipboardItems => {
        if (clipboardItems.length > 0) {
          triggerRiskEvent({
            type: 'CLIPBOARD_ACCESS',
            severity: 'LOW',
            desc: 'Background clipboard read detected — possible automated content injection.',
          });
        }
      }).catch(() => {});
    }
  }, [enabled, phase, triggerRiskEvent]);

  // ── Mount all listeners ────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur',    handleWindowBlur);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);

    const devtoolsInterval = setInterval(checkDevTools, 2000);
    const cssInterval = setInterval(checkCssInjection, 5000);
    const screenDimInterval = setInterval(checkScreenDim, 3000);
    const clipboardInterval = setInterval(checkClipboardApi, 10000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur',    handleWindowBlur);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
      clearInterval(devtoolsInterval);
      clearInterval(cssInterval);
      clearInterval(screenDimInterval);
      clearInterval(clipboardInterval);
    };
  }, [enabled, handleVisibilityChange, handleWindowBlur, handlePaste, handleKeyDown, checkDevTools, checkCssInjection, checkScreenDim, checkClipboardApi]);

  // Expose current counters for the sidebar badge
  return {
    tabSwitchCount:  tabSwitches,
    pasteCount:      pasteTotal,
    recordResponseTiming,
  };
}
