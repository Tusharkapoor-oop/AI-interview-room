/**
 * useApplicationLockdown.js — Layer 5+: Ultra-Strict Digital Lockdown
 *
 * Detects and penalizes during the interview:
 *   1. External application focus (window blur) — HIGH severity on repeat
 *   2. Browser extension injection (DOM mutation scanning)
 *   3. Screen recording / capture tools (getDisplayMedia sniffing)
 *   4. Virtual camera detection (device enumeration)
 *   5. Second monitor detection (screen geometry heuristics)
 *   6. Screenshot key combos (PrintScreen, Ctrl+Shift+S, etc.)
 *   7. Developer tools (F12 / Ctrl+Shift+I / Ctrl+U)
 *   8. Clipboard snoop attempt detection
 *   9. Extension API surface detection (chrome.runtime, etc.)
 *
 * All events fire addRiskEvent + showToast. HIGH events show fullscreen overlay.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useAegisStore } from './useAegisStore';

// Known virtual camera software fingerprints (case-insensitive)
const VIRTUAL_CAM_STRINGS = [
  'obs', 'manycam', 'xsplit', 'splitcam', 'droidcam',
  'epoccam', 'mmhmm', 'snap camera', 'virtual', 'vcam',
  'logitech capture', 'elgato', 'streamlabs',
];

// Known cheating/AI extension DOM fingerprints
const EXTENSION_SELECTORS = [
  '[data-grammarly]',           // Grammarly
  '.grammarly-btn',
  '#grammarly-extension',
  '[id*="gptengineer"]',        // GPT Engineer
  '[class*="openai"]',
  '[id*="chatgpt"]',
  'div[data-extension-id]',     // Generic extension containers
  '#quillbot-extension-root',   // QuillBot
  '[class*="quillbot"]',
  '[id*="wordtune"]',           // Wordtune
  '[class*="jasper"]',          // Jasper AI
  '[id*="copilot-sidebar"]',    // GitHub Copilot sidebar
  '.copilot-toggle',
  '[data-testid*="extension"]',
];

const BLUR_PENALTY_THRESHOLD = 2; // 2nd blur → HIGH
const BLUR_COOLDOWN_MS       = 8000;

export function useApplicationLockdown(enabled = true) {
  const { phase, addRiskEvent, showToast, setHitlEvent } = useAegisStore();
  const [lockdownOverlay, setLockdownOverlay] = useState(null); // { title, desc }

  const blurCount       = useRef(0);
  const lastBlurTime    = useRef(0);
  const extensionFlags  = useRef(new Set());
  const screenWarnFired = useRef(false);
  const virtualCamFlag  = useRef(false);
  const devtoolsFlag    = useRef(false);
  const screenshotFlag  = useRef(false);

  const firePenalty = useCallback((type, severity, desc, showOverlay = false) => {
    if (!enabled || phase !== 'interview') return;
    addRiskEvent({ type, severity, desc });
    showToast(`🚫 ${desc.slice(0, 80)}`, 'error', 6000);
    if (showOverlay) {
      setLockdownOverlay({ title: '⛔ Lockdown Violation Detected', desc });
      setTimeout(() => setLockdownOverlay(null), 5000);
    }
  }, [enabled, phase, addRiskEvent, showToast]);

  // ── 1. Window/App Focus Loss ────────────────────────────────────
  const handleWindowBlur = useCallback(() => {
    if (!enabled || phase !== 'interview') return;
    const now = Date.now();
    if (now - lastBlurTime.current < BLUR_COOLDOWN_MS) return; // debounce
    lastBlurTime.current = now;
    blurCount.current += 1;

    const count = blurCount.current;
    const severity = count >= BLUR_PENALTY_THRESHOLD ? 'HIGH' : 'MEDIUM';
    firePenalty(
      'WINDOW_BLUR',
      severity,
      `Browser/app focus lost (${count}× total). Possible external application or AI tool access.`,
      count >= BLUR_PENALTY_THRESHOLD
    );
    if (count >= BLUR_PENALTY_THRESHOLD) {
      setHitlEvent({
        type: 'REPEATED_APP_SWITCH',
        desc: `Candidate switched to external application ${count} times.`,
        severity: 'HIGH',
      });
    }
  }, [enabled, phase, firePenalty, setHitlEvent]);

  // ── 2. Browser Extension Injection Detection ─────────────────
  const checkExtensions = useCallback(() => {
    if (!enabled || phase !== 'interview') return;
    for (const sel of EXTENSION_SELECTORS) {
      try {
        const el = document.querySelector(sel);
        if (el && !extensionFlags.current.has(sel)) {
          extensionFlags.current.add(sel);
          firePenalty(
            'EXTENSION_DETECTED',
            'HIGH',
            `Browser extension detected: "${sel}". Extensions may provide AI assistance.`,
            true
          );
        }
      } catch (_) { /* invalid selector — skip */ }
    }
    // Also check for chrome.runtime (extension API)
    if (window.chrome?.runtime?.id && !extensionFlags.current.has('chrome.runtime')) {
      extensionFlags.current.add('chrome.runtime');
      firePenalty('EXTENSION_DETECTED', 'MEDIUM', 'Browser extension API detected (chrome.runtime).', false);
    }
  }, [enabled, phase, firePenalty]);

  // DOM mutation observer for late-injected extension nodes
  const setupExtensionObserver = useCallback(() => {
    const observer = new MutationObserver(() => {
      checkExtensions();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    return observer;
  }, [checkExtensions]);

  // ── 3. Virtual Camera Detection ─────────────────────────────
  const detectVirtualCamera = useCallback(async () => {
    if (!enabled || virtualCamFlag.current) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      for (const dev of videoDevices) {
        const label = (dev.label || '').toLowerCase();
        if (VIRTUAL_CAM_STRINGS.some(s => label.includes(s))) {
          virtualCamFlag.current = true;
          firePenalty(
            'VIRTUAL_CAM',
            'HIGH',
            `Virtual camera software detected: "${dev.label}". Please use your physical webcam only.`,
            true
          );
          break;
        }
      }
    } catch (_) {}
  }, [enabled, firePenalty]);

  // ── 4. Second Monitor / Window Position Detection ────────────
  const detectSecondMonitor = useCallback(() => {
    if (!enabled || screenWarnFired.current || phase !== 'interview') return;
    // If window is positioned on a monitor that is not the primary one
    const onSecondaryMonitor = window.screenLeft < 0 || window.screenTop < 0
      || window.screenLeft > screen.width || window.screenTop > screen.height;
    // Large available width delta (multiple monitors)
    const totalWidth = screen.availWidth;
    const singleWidth = window.screen.width;
    const multiMonitor = totalWidth > singleWidth * 1.6;

    if (onSecondaryMonitor || multiMonitor) {
      screenWarnFired.current = true;
      firePenalty(
        'MULTI_MONITOR',
        'MEDIUM',
        `Multiple monitors or secondary display detected. Please conduct the interview on a single screen.`,
        false
      );
    }
  }, [enabled, phase, firePenalty]);

  // ── 5. Screenshot / Screen Capture Key Detection ────────────
  const handleKeyDown = useCallback((e) => {
    if (!enabled || phase !== 'interview') return;

    // Block dangerous key combos
    const key = e.key?.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const alt = e.altKey;

    // DevTools combos
    if (key === 'f12' || (ctrl && shift && ['i', 'j', 'c'].includes(key)) || (ctrl && key === 'u')) {
      e.preventDefault();
      e.stopPropagation();
      if (!devtoolsFlag.current) {
        devtoolsFlag.current = true;
        firePenalty('DEVTOOLS_OPEN', 'MEDIUM', 'Developer tools hotkey blocked during interview.');
        setTimeout(() => { devtoolsFlag.current = false; }, 10000);
      }
      return;
    }

    // Screenshot combos
    const isScreenshot = key === 'printscreen'
      || (ctrl && shift && key === 's')
      || (ctrl && shift && key === '4')   // macOS
      || (ctrl && shift && key === '3')   // macOS
      || (e.metaKey && shift && key === '4');

    if (isScreenshot && !screenshotFlag.current) {
      screenshotFlag.current = true;
      firePenalty('SCREENSHOT_ATTEMPT', 'HIGH', 'Screenshot key detected during interview — screen capture is prohibited.', true);
      setTimeout(() => { screenshotFlag.current = false; }, 5000);
    }

    // Block Ctrl+S (save page), Ctrl+P (print), Ctrl+A (select all in interview context)
    if (ctrl && ['s', 'p'].includes(key)) {
      e.preventDefault();
    }

    // Block Alt+Tab: not fully blockable in browser but note it
    if (alt && key === 'tab') {
      e.preventDefault();
    }
  }, [enabled, phase, firePenalty]);

  // ── 6. Context Menu Block ────────────────────────────────────
  const handleContextMenu = useCallback((e) => {
    if (!enabled || phase !== 'interview') return;
    e.preventDefault();
    showToast('Right-click is disabled during the interview.', 'info', 2500);
  }, [enabled, phase, showToast]);

  // ── 7. Copy/Cut Block (prevents exfiltrating questions) ────
  const handleCopy = useCallback((e) => {
    if (!enabled || phase !== 'interview') return;
    e.preventDefault();
    firePenalty('CLIPBOARD_COPY', 'LOW', 'Copy action blocked during interview — screen content cannot be exported.');
  }, [enabled, phase, firePenalty]);

  // ── 8. Screen Recording API Detection ───────────────────────
  // We override getDisplayMedia at mount to detect if any OTHER context calls it
  const displayMediaOrigRef = useRef(null);
  const patchGetDisplayMedia = useCallback(() => {
    if (!navigator.mediaDevices?.getDisplayMedia) return;
    displayMediaOrigRef.current = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = async (...args) => {
      // Our own OnboardScreen sets window._aegisOwnDisplayMediaCall = true
      if (!window._aegisOwnDisplayMediaCall) {
        firePenalty(
          'SCREEN_CAPTURE_ATTEMPT',
          'HIGH',
          'Screen recording/capture API called during interview. This is a serious violation.',
          true
        );
      }
      return displayMediaOrigRef.current(...args);
    };
  }, [firePenalty]);

  // ── Mount everything ─────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', handleCopy);

    const observer = setupExtensionObserver();
    checkExtensions(); // immediate scan on mount

    detectVirtualCamera();
    detectSecondMonitor();
    patchGetDisplayMedia();

    // Periodic checks
    const extInterval    = setInterval(checkExtensions, 5000);
    const monitorInterval = setInterval(detectSecondMonitor, 15000);

    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('cut', handleCopy);
      observer.disconnect();
      clearInterval(extInterval);
      clearInterval(monitorInterval);
      if (displayMediaOrigRef.current && navigator.mediaDevices?.getDisplayMedia) {
        navigator.mediaDevices.getDisplayMedia = displayMediaOrigRef.current;
        displayMediaOrigRef.current = null;
      }
    };
  }, [enabled, handleWindowBlur, handleKeyDown, handleContextMenu, handleCopy,
      setupExtensionObserver, checkExtensions, detectVirtualCamera, detectSecondMonitor, patchGetDisplayMedia]);

  return { lockdownOverlay };
}
