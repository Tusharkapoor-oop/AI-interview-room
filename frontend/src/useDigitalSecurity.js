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
import { useEffect, useRef, useCallback } from 'react';
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
  onRiskEventRef.current = onRiskEvent;

  const triggerRiskEvent = useCallback((ev) => {
    addRiskEvent(ev);
    onRiskEventRef.current?.(ev);
  }, [addRiskEvent]);

  const tabSwitchCount  = useRef(0);
  const pasteCount      = useRef(0);
  const keystrokeBuffer = useRef([]);
  const devtoolsFlag    = useRef(false);

  // ── 1. Tab Visibility / Focus Monitoring ──────────────────────
  const handleVisibilityChange = useCallback(() => {
    if (!enabled || phase !== 'interview') return;
    if (document.hidden) {
      tabSwitchCount.current += 1;
      const count = tabSwitchCount.current;
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
  const handleKeyDown = useCallback((e) => {
    if (!enabled || phase !== 'interview') return;
    const now = Date.now();
    keystrokeBuffer.current.push(now);

    // Keep last 20 keystrokes
    if (keystrokeBuffer.current.length > 20) keystrokeBuffer.current.shift();

    // Analyze typing speed over last 10 keystrokes
    if (keystrokeBuffer.current.length >= 10) {
      const slice = keystrokeBuffer.current.slice(-10);
      const elapsed = slice[slice.length - 1] - slice[0];
      const charsPerSec = 9 / (elapsed / 1000);

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

  // ── Mount all listeners ────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur',    handleWindowBlur);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('keydown', handleKeyDown);

    const devtoolsInterval = setInterval(checkDevTools, 2000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur',    handleWindowBlur);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('keydown', handleKeyDown);
      clearInterval(devtoolsInterval);
    };
  }, [enabled, handleVisibilityChange, handleWindowBlur, handlePaste, handleKeyDown, checkDevTools]);

  // Expose current counters for the sidebar badge
  return {
    tabSwitchCount:  tabSwitchCount.current,
    pasteCount:      pasteCount.current,
  };
}
