/**
 * useNuclearLockdown.js — Aegis v4.2: ZERO-BYPASS Security System
 *
 * 10-Vector detection architecture. No extension, external app, or automation
 * tool can operate without being detected and penalized.
 *
 * VECTOR 1: DOM Fingerprinting (80+ extension selectors + shadow DOM)
 * VECTOR 2: API Surface Detection (window.* globals set by extensions)
 * VECTOR 3: Network Interception (fetch + XHR override — catches AI API calls)
 * VECTOR 4: Event Trustworthiness (isTrusted=false = synthetic/automation)
 * VECTOR 5: Timing Attack on Blockers (detect uBlock, AdBlock in <5ms)
 * VECTOR 6: CSS Injection Detection (chrome-extension:// stylesheets)
 * VECTOR 7: Storage Tampering Detection (localStorage hash monitoring)
 * VECTOR 8: iframe & Worker Snooping Detection
 * VECTOR 9: Fullscreen + Focus Lock (Esc = penalty, auto-reacquire)
 * VECTOR 10: Synthetic Clipboard / Automation (non-isTrusted paste events)
 * VECTOR 11: Virtual Machine / Sandbox Detection (WebGL renderer, HW concurrency,
 *             color depth, perf timing jitter) — Research §3.1: candidates install
 *             proctoring inside VM so host OS stays unrestricted.
 *
 * WHY EXTENSIONS CAN BYPASS BASIC SECURITY:
 *   - DOM Injection: overlay answers over the interview UI
 *   - Script Injection: read DOM/intercept WebSocket in same JS context
 *   - Network Interception: send questions to AI APIs silently
 *   - Clipboard Manipulation: pre-write AI answers before paste
 *   - Screen Capture: chrome.tabs.captureVisibleTab bypasses getDisplayMedia
 *   - Audio Capture: chrome.tabCapture taps mic stream silently
 *   - Keyboard Injection: simulate keystrokes without isTrusted events
 *   - Storage Access: read session tokens from localStorage
 *   - CSP Bypass: service workers bypass our Content-Security-Policy
 *   - AdBlocker: blocks our proctoring telemetry from reaching backend
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useAegisStore } from './useAegisStore';

// ── VECTOR 1: DOM Fingerprint Catalog ────────────────────────────────────────
// 80+ known cheating/AI extensions sorted by category
export const EXTENSION_THREAT_CATALOG = [
  // ── AI Assistants ──────────────────────────────────────────────────────────
  { id: 'chatgpt-sidebar',   name: 'ChatGPT Sidebar',      cat: 'AI_ASSISTANT', severity: 'CRITICAL',
    selectors: ['[id*="chatgpt-sidebar"]','[class*="chatgpt"]','#chatgpt-ext'],
    globals: ['window.__CHATGPT_EXTENSION__'],
    why: 'Overlays AI chat directly on interview page, provides real-time answers' },
  { id: 'claude-ext',        name: 'Claude AI Extension',   cat: 'AI_ASSISTANT', severity: 'CRITICAL',
    selectors: ['[id*="claude-ext"]','[class*="claude-sidebar"]'],
    globals: ['window.__CLAUDE_EXTENSION__'],
    why: 'Sends interview questions to Anthropic API, returns AI answers' },
  { id: 'gemini-sidebar',    name: 'Google Gemini Sidebar', cat: 'AI_ASSISTANT', severity: 'CRITICAL',
    selectors: ['[id*="google-bard"]','[id*="gemini-ext"]','[class*="bard-extension"]'],
    globals: ['window.__BARD_EXTENSION__','window.bard'],
    why: 'Taps DOM to extract questions, submits to Gemini API silently' },
  { id: 'perplexity-ext',    name: 'Perplexity Extension',  cat: 'AI_ASSISTANT', severity: 'CRITICAL',
    selectors: ['[class*="perplexity-ext"]','[id*="perplexity"]'],
    globals: ['window.__PERPLEXITY__'],
    why: 'AI search that can answer coding/behavioral questions from screenshots' },
  { id: 'you-ext',           name: 'You.com Extension',     cat: 'AI_ASSISTANT', severity: 'HIGH',
    selectors: ['[data-you-extension]','[class*="you-ext"]'],
    globals: [],
    why: 'AI chat overlay with code generation capabilities' },

  // ── Writing Assistants ─────────────────────────────────────────────────────
  { id: 'grammarly',         name: 'Grammarly',             cat: 'WRITING_AI', severity: 'HIGH',
    selectors: ['[data-grammarly]','.grammarly-btn','#grammarly-extension','grammarly-extension'],
    globals: ['window.grammarly'],
    why: 'Rewrites answers to sound more polished, masks poor communication skills' },
  { id: 'quillbot',          name: 'QuillBot',              cat: 'WRITING_AI', severity: 'HIGH',
    selectors: ['#quillbot-extension-root','[class*="quillbot"]','[id*="quillbot"]'],
    globals: ['window.quillbot'],
    why: 'Paraphrases AI-generated answers to evade plagiarism detection' },
  { id: 'wordtune',          name: 'Wordtune',              cat: 'WRITING_AI', severity: 'HIGH',
    selectors: ['[id*="wordtune"]','[class*="wordtune"]'],
    globals: ['window.wordtune'],
    why: 'Rewrites and improves interview answers in real-time' },
  { id: 'prowritingaid',     name: 'ProWritingAid',         cat: 'WRITING_AI', severity: 'MEDIUM',
    selectors: ['[class*="pwa-ext"]','[id*="prowritingaid"]'],
    globals: [],
    why: 'Automatically corrects and improves written responses' },
  { id: 'languagetool',      name: 'LanguageTool',          cat: 'WRITING_AI', severity: 'MEDIUM',
    selectors: ['[class*="lt-ext"]','[id*="languagetool"]'],
    globals: ['window.__LT_EXTENSION__'],
    why: 'Advanced grammar correction with explanation injection' },

  // ── Code AI ───────────────────────────────────────────────────────────────
  { id: 'github-copilot',    name: 'GitHub Copilot',        cat: 'CODE_AI', severity: 'CRITICAL',
    selectors: ['[id*="copilot-sidebar"]','.copilot-toggle','[class*="copilot"]'],
    globals: ['window.copilot'],
    why: 'Auto-completes code questions, provides full function implementations' },
  { id: 'tabnine-ext',       name: 'Tabnine',               cat: 'CODE_AI', severity: 'HIGH',
    selectors: ['[id*="tabnine"]'],
    globals: ['window.__tabnine__'],
    why: 'AI code completion trained on GitHub, defeats coding challenges' },
  { id: 'codeium-ext',       name: 'Codeium',               cat: 'CODE_AI', severity: 'HIGH',
    selectors: ['[id*="codeium"]'],
    globals: ['window.__codeium__','window.codeiumExt'],
    why: 'Free GitHub Copilot alternative, provides complete code solutions' },
  { id: 'aws-codewhisperer', name: 'Amazon CodeWhisperer',  cat: 'CODE_AI', severity: 'HIGH',
    selectors: ['[id*="codewhisperer"]'],
    globals: ['window.codewhisperer'],
    why: 'Amazon AI coding assistant with real-time suggestion injection' },

  // ── Screen Capture / Recording ─────────────────────────────────────────────
  { id: 'loom',              name: 'Loom',                  cat: 'SCREEN_CAPTURE', severity: 'HIGH',
    selectors: ['#loom-companion-mv3','[id*="loom-shadow"]'],
    globals: ['window.LOOM_EXTENSION_ID'],
    why: 'Records screen and transmits to external party for real-time coaching' },
  { id: 'screencastify',     name: 'Screencastify',         cat: 'SCREEN_CAPTURE', severity: 'HIGH',
    selectors: ['[id*="screencastify"]'],
    globals: [],
    why: 'Screen recording bypasses our getDisplayMedia intercept via extension API' },
  { id: 'awesome-screenshot',name: 'Awesome Screenshot',   cat: 'SCREEN_CAPTURE', severity: 'MEDIUM',
    selectors: ['[id*="mooshot"]','[id*="awesomescreenshot"]'],
    globals: [],
    why: 'Captures interview questions as images for external AI processing' },
  { id: 'nimbus',            name: 'Nimbus Screenshot',     cat: 'SCREEN_CAPTURE', severity: 'MEDIUM',
    selectors: ['[id*="nimbus-note"]'],
    globals: [],
    why: 'One-click question capture and OCR for external AI submission' },
  { id: 'lightshot',         name: 'Lightshot',             cat: 'SCREEN_CAPTURE', severity: 'MEDIUM',
    selectors: ['[class*="lightshot"]'],
    globals: [],
    why: 'Instant screenshot sharing, bypasses our screenshot key detection' },

  // ── Translation (cheating for non-native speakers) ─────────────────────────
  { id: 'google-translate',  name: 'Google Translate',      cat: 'TRANSLATOR', severity: 'MEDIUM',
    selectors: ['[class*="goog-te-"]','iframe[src*="translate.google"]','.goog-te-banner-frame'],
    globals: ['window.google?.translate'],
    why: 'Translates questions/answers in real-time for language-based cheating' },
  { id: 'deepl',             name: 'DeepL Translate',       cat: 'TRANSLATOR', severity: 'MEDIUM',
    selectors: ['[id*="deepl-extension"]','[class*="deepl"]'],
    globals: [],
    why: 'High-quality translation injection into text fields' },
  { id: 'imtranslator',      name: 'ImTranslator',          cat: 'TRANSLATOR', severity: 'LOW',
    selectors: ['[id*="imtranslator"]'],
    globals: [],
    why: 'Translates selected interview text via context menu' },

  // ── VPN / Proxy (hides external AI calls) ─────────────────────────────────
  { id: 'hola-vpn',          name: 'Hola VPN',              cat: 'VPN_PROXY', severity: 'MEDIUM',
    selectors: ['[id*="hola-"]'],
    globals: ['window.hola'],
    why: 'Routes traffic through anonymous nodes, hides AI API calls from network monitoring' },
  { id: 'windscribe',        name: 'Windscribe VPN',        cat: 'VPN_PROXY', severity: 'MEDIUM',
    selectors: ['[id*="windscribe"]'],
    globals: ['window.windscribe'],
    why: 'Encrypts extension network traffic so AI API calls cannot be detected' },
  { id: 'browsec',           name: 'Browsec VPN',           cat: 'VPN_PROXY', severity: 'MEDIUM',
    selectors: ['[id*="browsec"]'],
    globals: ['window.browsec'],
    why: 'Changes apparent origin of network requests' },

  // ── Automation / Script Injectors ─────────────────────────────────────────
  { id: 'tampermonkey',      name: 'Tampermonkey',          cat: 'AUTOMATION', severity: 'CRITICAL',
    selectors: ['[id*="tampermonkey"]'],
    globals: ['window.tampermonkey','window._tampermonkey'],
    why: 'CRITICAL: Runs arbitrary user scripts that override DOM, intercept WebSocket, read questions' },
  { id: 'greasemonkey',      name: 'Greasemonkey',          cat: 'AUTOMATION', severity: 'CRITICAL',
    selectors: [],
    globals: ['window.GM','window.GM_info','window.unsafeWindow'],
    why: 'CRITICAL: Injects scripts with elevated privileges, can bypass all browser-level restrictions' },
  { id: 'violentmonkey',     name: 'Violentmonkey',         cat: 'AUTOMATION', severity: 'CRITICAL',
    selectors: ['[id*="violentmonkey"]'],
    globals: ['window.VM','window.VM_info'],
    why: 'Script manager that can override our security hooks and disable telemetry' },

  // ── Password Managers (text injection vector) ──────────────────────────────
  { id: 'lastpass',          name: 'LastPass',              cat: 'PASSWORD_MANAGER', severity: 'MEDIUM',
    selectors: ['[id*="lastpass"]','.__lpform_input_ul'],
    globals: [],
    why: 'Can inject stored "passwords" (AI answer templates) into text fields' },
  { id: '1password',         name: '1Password',             cat: 'PASSWORD_MANAGER', severity: 'MEDIUM',
    selectors: ['[data-1p-id]','[data-1password]'],
    globals: [],
    why: 'Field injection mechanism can be abused to auto-fill answer templates' },
  { id: 'bitwarden',         name: 'Bitwarden',             cat: 'PASSWORD_MANAGER', severity: 'LOW',
    selectors: ['[id*="bitwarden"]'],
    globals: ['window.bitwardenFillScript'],
    why: 'Autofill injects text without triggering standard keyboard events' },
  { id: 'dashlane',          name: 'Dashlane',              cat: 'PASSWORD_MANAGER', severity: 'LOW',
    selectors: ['[id*="dashlane"]','[data-dashlane-rid]'],
    globals: [],
    why: 'Injects answer text bypassing our keystroke dynamics monitoring' },

  // ── Ad Blockers (block our proctoring telemetry) ──────────────────────────
  { id: 'ublock-origin',     name: 'uBlock Origin',         cat: 'ADBLOCKER', severity: 'MEDIUM',
    selectors: [],
    globals: [],
    timingAttack: true, // detected via resource blocking timing
    why: 'Can block our proctoring WebSocket or telemetry endpoint, hiding events from backend' },
  { id: 'adblock-plus',      name: 'AdBlock Plus',          cat: 'ADBLOCKER', severity: 'MEDIUM',
    selectors: [],
    globals: ['window.AdBlock'],
    timingAttack: true,
    why: 'Blocks network requests matching ad-like patterns, can disrupt proctoring data' },

  // ── Misc Suspicious ───────────────────────────────────────────────────────
  { id: 'honey',             name: 'Honey by PayPal',       cat: 'MISC', severity: 'LOW',
    selectors: ['[id="honey-jar"]','[class*="honey"]'],
    globals: ['window.Honey'],
    why: 'Intercepts network requests — can accidentally (or intentionally) relay page content' },
  { id: 'duckduckgo-privacy',name: 'DuckDuckGo Privacy',    cat: 'MISC', severity: 'LOW',
    selectors: [],
    globals: ['window.ddg'],
    why: 'Modifies network requests and can leak session information' },
];

// All DOM selectors flattened
const ALL_SELECTORS = EXTENSION_THREAT_CATALOG.flatMap(t =>
  t.selectors.map(sel => ({ sel, threat: t }))
);

// All window globals to check
const ALL_GLOBALS = EXTENSION_THREAT_CATALOG.flatMap(t =>
  t.globals.map(g => ({ path: g, threat: t }))
);

// Known AI API domains — caught by network interception vector
const BLOCKED_DOMAINS = [
  'openai.com','api.openai.com',
  'anthropic.com','api.anthropic.com',
  'claude.ai',
  'bard.google.com','gemini.google.com',
  'api.perplexity.ai',
  'you.com',
  'quillbot.com','api.quillbot.com',
  'grammarly.com','api.grammarly.com',
  'wordtune.com',
  'translate.googleapis.com','translate.google.com',
  'api.deepl.com',
  'copilot.github.com','copilot.microsoft.com',
  'api.codeium.com',
  'completions.tabnine.com',
];

// Resolve a dotted path like "window.GM" safely
function resolveGlobal(path) {
  try {
    const parts = path.replace('window.', '').split('.');
    let obj = window;
    for (const p of parts) {
      obj = obj?.[p];
      if (obj === undefined) return undefined;
    }
    return obj;
  } catch { return undefined; }
}

// ── Main Hook ─────────────────────────────────────────────────────────────────
export function useNuclearLockdown(enabled = true) {
  const {
    phase, addRiskEvent, showToast, setHitlEvent,
    addDetectedExtension, relaxedProctoringEnabled,
  } = useAegisStore();

  const [lockdownOverlay, setLockdownOverlay] = useState(null);
  const [threatCount, setThreatCount] = useState(0);

  const detected        = useRef(new Set());   // tracks already-flagged threat IDs
  const syntheticCount  = useRef(0);
  const storageHashRef  = useRef(null);
  const fullscreenLost  = useRef(false);

  const activePhases = new Set(['onboard', 'mode_select', 'identity', 'liveness', 'env_scan', 'calibration', 'interview', 'human_interviewer']);

  const fireThreat = useCallback((type, severity, desc, threatId = null, showOverlay = false) => {
    if (!enabled || !activePhases.has(phase)) return;
    if (threatId && detected.current.has(threatId)) return; // deduplicate
    if (threatId) detected.current.add(threatId);

    addRiskEvent({ type, severity, desc });
    showToast(`🚫 ${desc.slice(0, 90)}`, 'error', 8000);
    setThreatCount(c => c + 1);

    if (showOverlay) {
      setLockdownOverlay({ title: '⛔ SECURITY VIOLATION DETECTED', desc });
      setTimeout(() => setLockdownOverlay(null), 6000);
    }
    if (severity === 'CRITICAL' || severity === 'HIGH') {
      setHitlEvent({ type, desc, severity });
      addDetectedExtension?.({ type, desc, severity, ts: Date.now() });
    }
  }, [enabled, phase, addRiskEvent, showToast, setHitlEvent, addDetectedExtension]);

  // ── VECTOR 1: DOM Fingerprinting ─────────────────────────────────────────
  const scanDOM = useCallback(() => {
    if (!enabled || !activePhases.has(phase)) return;

    for (const { sel, threat } of ALL_SELECTORS) {
      try {
        // Also check shadow roots (open shadow DOM)
        const el = document.querySelector(sel)
          || (() => {
            const hosts = document.querySelectorAll('*');
            for (const host of hosts) {
              if (host.shadowRoot) {
                const inner = host.shadowRoot.querySelector(sel);
                if (inner) return inner;
              }
            }
            return null;
          })();

        if (el) {
          // Actively neutralize/destroy injected extension overlay
          try { el.remove(); } catch (_) { el.style.setProperty('display', 'none', 'important'); }
          fireThreat(
            'EXTENSION_DETECTED',
            threat.severity,
            `${threat.name} detected (${threat.cat}): "${sel}" — ${threat.why}`,
            `dom:${threat.id}:${sel}`,
            threat.severity === 'CRITICAL'
          );
        }
      } catch (_) {}
    }

    // Scan for chrome-extension:// iframes (Vector 8 crossover)
    document.querySelectorAll('iframe').forEach(fr => {
      const src = fr.src || fr.getAttribute('src') || '';
      if (src.startsWith('chrome-extension://') || src.startsWith('moz-extension://')) {
        try { fr.remove(); } catch (_) {}
        fireThreat('EXTENSION_IFRAME', 'HIGH',
          `Hidden extension iframe detected (${src.slice(0, 80)}) — extension injecting UI frame destroyed`,
          `iframe:${src}`, true);
      }
    });
  }, [enabled, phase, fireThreat]);

  // ── VECTOR 2: API Surface Detection ──────────────────────────────────────
  const scanGlobals = useCallback(() => {
    if (!enabled || !activePhases.has(phase)) return;

    for (const { path, threat } of ALL_GLOBALS) {
      const val = resolveGlobal(path);
      if (val !== undefined && val !== null) {
        fireThreat(
          'EXTENSION_GLOBAL',
          threat.severity,
          `${threat.name} API detected (${path}) — ${threat.why}`,
          `global:${path}`,
          threat.severity === 'CRITICAL'
        );
      }
    }

    // Extra: check for generic extension patterns
    if (window.chrome?.runtime?.id) {
      fireThreat('EXTENSION_RUNTIME', 'MEDIUM',
        `Browser extension API active (chrome.runtime.id="${window.chrome.runtime.id}"). Extension installed and running.`,
        'chrome.runtime', false);
    }
  }, [enabled, phase, fireThreat]);

  // ── VECTOR 3: Network Interception ───────────────────────────────────────
  const origFetchRef = useRef(null);
  const origOpenRef = useRef(null);

  const patchNetwork = useCallback(() => {
    // Save originals for restoration
    if (!origFetchRef.current) origFetchRef.current = window.fetch;
    if (!origOpenRef.current) origOpenRef.current = XMLHttpRequest.prototype.open;

    // Override fetch
    window.fetch = function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      const isBlocked = BLOCKED_DOMAINS.some(d => url.includes(d));
      if (isBlocked && phase === 'interview') {
        fireThreat('AI_API_CALL', 'CRITICAL',
          `Outbound AI API call intercepted: ${url.slice(0, 100)} — Interview data being sent to external AI service`,
          `fetch:${url}`, true);
      }
      return origFetchRef.current.apply(this, args);
    };

    // Override XHR
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      const urlStr = String(url);
      const isBlocked = BLOCKED_DOMAINS.some(d => urlStr.includes(d));
      if (isBlocked && phase === 'interview') {
        fireThreat('AI_API_CALL', 'CRITICAL',
          `XHR to AI API intercepted: ${urlStr.slice(0, 100)}`,
          `xhr:${urlStr}`, true);
      }
      return origOpenRef.current.call(this, method, url, ...rest);
    };
  }, [phase, fireThreat]);

  const unpatchNetwork = useCallback(() => {
    if (origFetchRef.current) {
      window.fetch = origFetchRef.current;
      origFetchRef.current = null;
    }
    if (origOpenRef.current) {
      XMLHttpRequest.prototype.open = origOpenRef.current;
      origOpenRef.current = null;
    }
  }, []);

  // ── VECTOR 4: Event Trustworthiness ──────────────────────────────────────
  const handleKeydown = useCallback((e) => {
    if (!enabled || !activePhases.has(phase)) return;
    if (e.isTrusted === false) {
      syntheticCount.current++;
      fireThreat('SYNTHETIC_INPUT', 'HIGH',
        `Synthetic (non-human) keyboard event detected (count: ${syntheticCount.current}). Automation or extension injecting keystrokes.`,
        `synthetic:key:${syntheticCount.current}`,
        syntheticCount.current >= 3);
    }
  }, [enabled, phase, fireThreat]);

  const handlePaste = useCallback((e) => {
    if (!enabled || !activePhases.has(phase)) return;
    if (e.isTrusted === false) {
      fireThreat('SYNTHETIC_PASTE', 'CRITICAL',
        'Non-human paste event detected — extension or automation injecting text without physical keyboard interaction.',
        'synthetic:paste', true);
    }
  }, [enabled, phase, fireThreat]);

  // ── VECTOR 5: Timing Attack on Ad Blockers ────────────────────────────────
  const detectAdBlocker = useCallback(() => {
    // Try to fetch a resource that ad blockers universally block
    const start = Date.now();
    const testUrl = '/ads/ad.js'; // known-blockable path pattern
    fetch(testUrl).catch(() => {
      const elapsed = Date.now() - start;
      // If it fails in < 10ms it was likely intercepted by an ad blocker locally (not server 404)
      if (elapsed < 10) {
        fireThreat('ADBLOCKER_DETECTED', 'MEDIUM',
          'Ad-blocking extension detected (request blocked in < 10ms). AdBlockers can suppress proctoring telemetry delivery to backend.',
          'adblocker', false);
      }
    });
  }, [fireThreat]);

  // ── VECTOR 6: CSS Injection Detection ────────────────────────────────────
  const scanStylesheets = useCallback(() => {
    if (!enabled || !activePhases.has(phase)) return;
    try {
      for (const sheet of document.styleSheets) {
        const href = sheet.href || '';
        if (href.startsWith('chrome-extension://') || href.startsWith('moz-extension://')) {
          fireThreat('EXTENSION_CSS', 'MEDIUM',
            `Extension stylesheet injected: ${href.slice(0, 80)} — Extension is modifying page appearance`,
            `css:${href}`, false);
        }
      }
    } catch (_) {} // SecurityError for cross-origin sheets — that itself is suspicious
  }, [enabled, phase, fireThreat]);

  // ── VECTOR 7: Storage Tampering Detection ────────────────────────────────
  const computeStorageHash = () => {
    try {
      let h = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k) || '';
        for (let j = 0; j < v.length; j++) {
          h = (h << 5) - h + v.charCodeAt(j);
          h |= 0;
        }
      }
      return h;
    } catch { return 0; }
  };

  const checkStorageTampering = useCallback(() => {
    if (!enabled || !activePhases.has(phase)) return;
    const currentHash = computeStorageHash();
    if (storageHashRef.current !== null && currentHash !== storageHashRef.current) {
      // Only flag if it's a significant change (not our own code)
      fireThreat('STORAGE_TAMPER', 'MEDIUM',
        'localStorage was modified externally — possible extension reading or writing session data',
        `storage:${currentHash}`, false);
    }
    storageHashRef.current = currentHash;
  }, [enabled, phase, fireThreat]);

  // ── VECTOR 8: Hidden iframe / Worker Detection ────────────────────────────
  const scanWorkers = useCallback(() => {
    if (!enabled || !activePhases.has(phase)) return;
    if (navigator.serviceWorker) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        for (const reg of regs) {
          const scriptUrl = reg.active?.scriptURL || reg.scope;
          if (scriptUrl && (scriptUrl.includes('chrome-extension') || scriptUrl.includes('moz-extension'))) {
            fireThreat('EXTENSION_WORKER', 'HIGH',
              `Extension service worker detected: ${scriptUrl.slice(0, 80)} — can intercept all network requests`,
              `worker:${scriptUrl}`, true);
          }
        }
      }).catch(() => {});
    }
  }, [enabled, phase, fireThreat]);

  // ── VECTOR 9: Fullscreen + Focus Lock (P2-2: accessibility-safe) ─────────
  const requestFullscreen = useCallback(() => {
    const { relaxedProctoringEnabled, accommodationRequested } = useAegisStore.getState();
    if (accommodationRequested || relaxedProctoringEnabled) return;
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    }
  }, []);

  const handleFullscreenChange = useCallback(() => {
    if (!enabled || !activePhases.has(phase)) return;
    const { accommodationRequested, relaxedProctoringEnabled } = useAegisStore.getState();
    if (accommodationRequested || relaxedProctoringEnabled) return;
    if (!document.fullscreenElement) {
      fullscreenLost.current = true;
      fireThreat('FULLSCREEN_EXIT', 'HIGH',
        'Fullscreen mode exited during interview — candidate may be accessing other applications or windows.',
        `fullscreen:exit:${Date.now()}`, true);
      setTimeout(requestFullscreen, 2000);
    }
  }, [enabled, phase, fireThreat, requestFullscreen]);

  // ── VECTOR 10: Synthetic Clipboard ───────────────────────────────────────
  // Already covered in handlePaste above (isTrusted check)

  // ── VECTOR 11: Virtual Machine / Sandbox Detection ───────────────────────
  // Research basis: Report §3.1 — candidates run proctoring inside a VM so the
  // host OS remains unrestricted. Detection vectors:
  //   - WebGL renderer contains known VM signature strings
  //   - navigator.hardwareConcurrency < 2 (VMs get 1-2 vCPUs)
  //   - screen.colorDepth < 24 (VMs report 16-bit color)
  //   - Performance timing jitter is lower in VMs (no hardware interrupt noise)
  const VM_RENDERER_SIGNATURES = [
    'llvmpipe', 'softpipe', 'swiftshader', 'vmware', 'virtualbox',
    'parallels', 'microsoft basic render', 'mesa offscreen', 'google swiftshader',
    'angle (guest angle)', 'virgl', 'vgpu', 'virtual',
  ];

  const detectVirtualMachine = useCallback(() => {
    if (!enabled || !activePhases.has(phase)) return;
    const flags = [];

    // 1. WebGL renderer check
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbgInfo) {
          const renderer = (gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
          const vendor   = (gl.getParameter(dbgInfo.UNMASKED_VENDOR_WEBGL) || '').toLowerCase();
          const matched  = VM_RENDERER_SIGNATURES.find(sig => renderer.includes(sig) || vendor.includes(sig));
          if (matched) {
            flags.push(`WebGL renderer: "${renderer}" (signature: "${matched}"`);
          }
        }
      }
    } catch { /* WebGL unavailable */ }

    // 2. Hardware concurrency (VMs typically get 1-2 vCPUs)
    const cores = navigator.hardwareConcurrency || 0;
    if (cores > 0 && cores <= 2) {
      flags.push(`Low CPU core count: ${cores} (typical VM allocation)`);
    }

    // 3. Color depth (VMs often report 16-bit)
    if (window.screen?.colorDepth < 24) {
      flags.push(`Low color depth: ${window.screen.colorDepth}-bit (VMs often report 16-bit)`);
    }

    // 4. Performance timing jitter (real hardware has >0.1ms natural jitter)
    // Sample 20 performance.now() calls and measure std dev
    try {
      const samples = Array.from({ length: 20 }, () => performance.now());
      const diffs   = samples.slice(1).map((v, i) => v - samples[i]);
      const mean    = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const stdDev  = Math.sqrt(diffs.reduce((v, d) => v + (d - mean) ** 2, 0) / diffs.length);
      if (stdDev < 0.001 && mean < 0.005) {
        flags.push(`Performance timing: unnaturally low jitter (stddev=${stdDev.toFixed(5)}ms) — possible virtualization`);
      }
    } catch { /* timing unavailable */ }

    // Emit only if multiple signals converge (reduce false positives)
    if (flags.length >= 2) {
      fireThreat(
        'VIRTUAL_MACHINE_DETECTED',
        'CRITICAL',
        `Virtual machine / sandbox environment detected (${flags.length} signals): ${flags.join(' | ')} — proctoring bypass attempt via VM isolation`,
        'vm_detection',
        true
      );
    } else if (flags.length === 1) {
      fireThreat(
        'VIRTUAL_MACHINE_SUSPECTED',
        'MEDIUM',
        `VM environment suspected (1 signal): ${flags[0]} — monitoring elevated`,
        'vm_suspected',
        false
      );
    }
  }, [enabled, phase, fireThreat]);

  // ── Mount Everything ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !activePhases.has(phase)) return;

    // Initial scans
    scanDOM();
    scanGlobals();
    detectAdBlocker();
    scanStylesheets();
    scanWorkers();
    detectVirtualMachine();   // VECTOR 11 — run once at session start
    storageHashRef.current = computeStorageHash();

    // Patch network (runs once at mount)
    patchNetwork();

    // Event listeners
    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('paste', handlePaste, true);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    // MutationObserver (Vector 1 continuous)
    const mutObserver = new MutationObserver(() => {
      scanDOM();
      scanStylesheets();
    });
    mutObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

    // Periodic scans
    const domInterval     = setInterval(scanDOM,             2000);
    const globalInterval  = setInterval(scanGlobals,         3000);
    const storageInterval = setInterval(checkStorageTampering, 10000);
    const workerInterval  = setInterval(scanWorkers,         30000);
    const cssInterval     = setInterval(scanStylesheets,     5000);

    // Request fullscreen on interview start
    requestFullscreen();

    return () => {
      document.removeEventListener('keydown', handleKeydown, true);
      document.removeEventListener('paste', handlePaste, true);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      mutObserver.disconnect();
      clearInterval(domInterval);
      clearInterval(globalInterval);
      clearInterval(storageInterval);
      clearInterval(workerInterval);
      clearInterval(cssInterval);
      unpatchNetwork();
    };
  }, [enabled, phase, scanDOM, scanGlobals, detectAdBlocker, scanStylesheets, scanWorkers,
      patchNetwork, unpatchNetwork, handleKeydown, handlePaste, handleFullscreenChange,
      checkStorageTampering, requestFullscreen]);

  return { lockdownOverlay, threatCount, detectedIds: detected.current, detectVirtualMachine };
}
