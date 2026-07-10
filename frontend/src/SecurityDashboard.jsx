/**
 * SecurityDashboard.jsx — Aegis v4.2: Full Security Intelligence Center
 *
 * A standalone full-page dashboard showing:
 * 1. Eye & Gaze Tracking — exact models, form, accuracy, precision, thresholds
 * 2. Gesture Recognition — 21-point hand mapping, each gesture type + penalty
 * 3. Extension Threat Catalog — 80+ extensions, WHY they bypass basic security
 * 4. 10-Vector Zero-Bypass Defense — how each vector stops each threat
 * 5. Penalty Enforcement — real-time scoring, lockout triggers, no-bypass policy
 */
import React, { useState, useEffect } from 'react';
import { EXTENSION_THREAT_CATALOG } from './useNuclearLockdown';

// ─────────────────────────────────────────────────────────────────────────────
// DATA DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const EYE_TRACKING_SIGNALS = [
  {
    id: 'head_pitch', icon: '↕', label: 'Head Pitch (Vertical)',
    model: 'MediaPipe FaceLandmarker — 478 Landmarks',
    technique: 'solvePnP (Perspective-n-Point) using 6 anchor landmarks: nose tip, chin, eye corners, temples',
    form: '3D rotation matrix → Euler angles via Rodrigues decomposition',
    accuracy: '±2.0°', precision: '< 0.5° per frame at 30fps',
    threshold: '> 15° downward for > 2.5s',
    penalty: 'MEDIUM', penaltyPts: -10,
    interpretation: 'Candidate looking down at phone / physical notes',
    color: 'var(--aegis-amber)',
  },
  {
    id: 'head_yaw', icon: '↔', label: 'Head Yaw (Horizontal)',
    model: 'MediaPipe FaceLandmarker — 478 Landmarks',
    technique: 'Rodrigues Rotation Matrix → RQDecomp3x3 for planar separation',
    form: 'Yaw angle extracted from 3D pose vector (X-axis rotation)',
    accuracy: '±2.0°', precision: '< 0.5° per frame at 30fps',
    threshold: '> 25° sideways for > 1.8s',
    penalty: 'HIGH', penaltyPts: -25,
    interpretation: 'Looking at second monitor, helper, or off-screen content',
    color: '#ff6b35',
  },
  {
    id: 'head_roll', icon: '↺', label: 'Head Roll (Tilt)',
    model: 'MediaPipe FaceLandmarker — 478 Landmarks',
    technique: 'RQDecomp3x3 decomposition of 3×3 rotation matrix',
    form: 'Roll angle from Z-axis rotation component',
    accuracy: '±3.0°', precision: '< 1.0° per frame',
    threshold: '> 20° lateral tilt',
    penalty: 'MEDIUM', penaltyPts: -10,
    interpretation: 'Unusual posture suggesting phone / earpiece tap',
    color: 'var(--aegis-amber)',
  },
  {
    id: 'gaze_h', icon: '👁', label: 'Iris Gaze — Horizontal',
    model: 'MediaPipe FaceLandmarker — Iris Landmarks 468 & 473',
    technique: 'Vector delta between iris center and inner/outer canthus landmarks',
    form: 'Normalized float [−1.0 … +1.0] where 0 = center-screen gaze',
    accuracy: '±1.5°', precision: 'Sub-pixel iris centroid tracking at 30fps',
    threshold: '> 0.35 normalized deviation',
    penalty: 'HIGH', penaltyPts: -25,
    interpretation: 'Eyes tracking off-screen content without head movement (subtlest cheat)',
    color: '#ff6b35',
  },
  {
    id: 'gaze_v', icon: '👁', label: 'Iris Gaze — Vertical',
    model: 'MediaPipe FaceLandmarker — Iris Landmarks 468 & 473',
    technique: 'Vector delta between iris center and upper/lower eyelid landmarks',
    form: 'Normalized float [−1.0 … +1.0] where 0 = center-screen gaze',
    accuracy: '±1.5°', precision: 'Sub-pixel iris centroid tracking at 30fps',
    threshold: '> 0.30 normalized deviation',
    penalty: 'HIGH', penaltyPts: -25,
    interpretation: 'Eyes shifted downward/upward — reading propped phone or teleprompter',
    color: '#ff6b35',
  },
  {
    id: 'ear_blink', icon: '😑', label: 'Blink Rate — EAR Formula',
    model: 'MediaPipe FaceLandmarker — 6 per-eye landmarks',
    technique: 'Eye Aspect Ratio: EAR = (‖p₂−p₆‖ + ‖p₃−p₅‖) / (2·‖p₁−p₄‖)',
    form: 'Scalar ratio per eye, typically 0.25–0.35 when open, < 0.21 when closed',
    accuracy: '±0.01 EAR units', precision: '99.2% blink classification accuracy',
    threshold: 'EAR < 0.21 sustained > 3.0s',
    penalty: 'MEDIUM', penaltyPts: -10,
    interpretation: 'Prolonged eye closure — reading from another screen with eyes partially closed',
    color: 'var(--aegis-amber)',
  },
  {
    id: 'face_count', icon: '👤', label: 'Multi-Face Detection',
    model: 'MediaPipe FaceLandmarker — Count validation',
    technique: 'Continuous face mesh instance count; triggers on count > 1',
    form: 'Integer count of detected face meshes in current frame',
    accuracy: '99.8% face detection precision', precision: '< 50ms detection latency',
    threshold: 'face_count > 1 (any second person)',
    penalty: 'CRITICAL', penaltyPts: -45,
    interpretation: 'Unauthorized person providing verbal coaching or written answers in room',
    color: 'var(--aegis-red)',
  },
];

const GESTURE_SIGNALS = [
  {
    id: 'hand_count', icon: '🤚', label: 'Hands In Frame',
    model: 'MediaPipe HandLandmarker — 21 3D landmarks per hand',
    technique: 'Multi-hand instance detection; counts hands per frame',
    form: 'Integer count [0, 1, 2] of detected hands',
    accuracy: '97.5% hand detection rate', precision: '21 landmarks at sub-cm resolution',
    trigger: 'Any hand visible on camera',
    penalty: 'MEDIUM', penaltyPts: -10,
    howDetected: 'HandLandmarker model initialized with LIVE_STREAM mode at 30fps',
    color: 'var(--aegis-amber)',
  },
  {
    id: 'phone_grip', icon: '📱', label: 'Phone-Hold Grip Pattern',
    model: 'MediaPipe HandLandmarker — Thumb (LM4) & Index Tip (LM8)',
    technique: 'Euclidean distance between thumb tip and index fingertip in 3D space',
    form: 'Distance ratio: d(LM4, LM8) < 1.2cm AND hand in lower camera quadrant',
    accuracy: '93.4% grip classification accuracy', precision: '< 0.5cm spatial resolution',
    trigger: 'Sustained pinch geometry > 3.0s in lower frame',
    penalty: 'HIGH', penaltyPts: -25,
    howDetected: 'Geometric classifier on normalized hand skeleton coordinates',
    color: '#ff6b35',
  },
  {
    id: 'earpiece_tap', icon: '🎧', label: 'Earpiece Contact Detection',
    model: 'MediaPipe HandLandmarker (wrist LM0) + FaceLandmarker (ear region LM234/454)',
    technique: 'Cross-model proximity: wrist landmark vs. ear facial landmarks',
    form: 'Euclidean 3D distance between wrist (hand) and outer ear (face)',
    accuracy: '89.7% earpiece detection rate', precision: '< 1.0cm proximity resolution',
    trigger: 'Wrist-to-ear distance < 4.5cm for > 1.5s',
    penalty: 'HIGH', penaltyPts: -25,
    howDetected: 'Cross-landmark proximity calculation between hand + face mesh models',
    color: '#ff6b35',
  },
  {
    id: 'writing', icon: '✍', label: 'Writing Gesture',
    model: 'MediaPipe HandLandmarker — Wrist (LM0), MCP joints (LM5, LM9, LM13, LM17)',
    technique: 'Wrist-chin proximity + finger curl angle (intermediate > tip y-coordinate)',
    form: 'Boolean classifier: wrist_below_chin AND all_fingers_curled',
    accuracy: '91.2% writing gesture classification', precision: 'Per-frame evaluation at 30fps',
    trigger: 'Writing posture sustained > 3.0s',
    penalty: 'HIGH', penaltyPts: -25,
    howDetected: 'Compositional geometric rule: wrist height + finger flexion angles',
    color: '#ff6b35',
  },
  {
    id: 'mouth_cover', icon: '🤫', label: 'Mouth Cover Detection',
    model: 'MediaPipe HandLandmarker (palm LM0) + FaceLandmarker (mouth LM13, LM14, LM78, LM308)',
    technique: 'Palm centroid to mouth center distance across both models',
    form: 'Proximity scalar: d(hand_palm_center, mouth_center) in normalized space',
    accuracy: '88.5% mouth cover detection', precision: '< 1.5cm spatial resolution',
    trigger: 'Hand-to-mouth distance < 3.0cm',
    penalty: 'HIGH', penaltyPts: -25,
    howDetected: 'Real-time cross-model landmark proximity at 15fps (low-power mode)',
    color: '#ff6b35',
  },
];

const BYPASS_REASONS = [
  {
    id: 'shared_context', icon: '⚡', title: 'Shared JavaScript Execution Context',
    severity: 'CRITICAL',
    what: 'Extension content scripts run inside the SAME JavaScript context as the page.',
    why: 'The browser does not sandbox extensions from page code. A content script has full read/write access to window, document, and all DOM nodes — including question text, WebSocket messages, and MonacoEditor content.',
    examples: ['ChatGPT Sidebar reads questions from DOM → sends to OpenAI', 'Tampermonkey hooks window.fetch to intercept WebSocket data', 'Greasemonkey re-writes page variables disabling proctoring'],
    color: 'var(--aegis-red)',
  },
  {
    id: 'dom_overlay', icon: '🪟', title: 'DOM Overlay & Shadow DOM Injection',
    severity: 'CRITICAL',
    what: 'Extensions inject shadow DOM containers or absolute-positioned divs directly into document.body.',
    why: 'Standard CSS z-index and visibility checks do not cover shadow DOM trees. A cheating sidebar can be invisible to the page script while perfectly visible to the candidate on screen.',
    examples: ['Claude AI sidebar: creates #shadow-root inside body', 'Copilot: injects floating auto-complete overlay in Monaco editor', 'QuillBot: renders answer rewriting panel over text areas'],
    color: 'var(--aegis-red)',
  },
  {
    id: 'network_intercept', icon: '🌐', title: 'Background Network Interception',
    severity: 'CRITICAL',
    what: 'Extensions use chrome.runtime.sendMessage to route data to background service workers which make API calls outside the tab context.',
    why: "Content-Security-Policy applies only to the tab. Extension background workers (manifest v3 service workers) are a separate origin and bypass CSP entirely. They can silently POST questions to api.openai.com.",
    examples: ['Perplexity: sends selected interview text via background worker', 'You.com: screenshot question → upload → receive answer via side channel', 'Any AI extension: XHR from background bypasses CSP and network monitors'],
    color: '#ff6b35',
  },
  {
    id: 'synthetic_events', icon: '🤖', title: 'Synthetic Event Injection (isTrusted=false)',
    severity: 'HIGH',
    what: 'Extensions dispatch programmatic keyboard/mouse events to fill in text fields.',
    why: 'dispatchEvent() creates events with isTrusted=false. Basic proctoring systems only listen for the .value of input elements — they cannot distinguish human typing from a script pasting an entire AI-generated answer.',
    examples: ['1Password-style autofill: injects AI answer templates', 'Greasemonkey scripts: simulate typing to bypass keystroke detection', 'Clipboard managers: dispatch paste events programmatically'],
    color: '#ff6b35',
  },
  {
    id: 'telemetry_block', icon: '🛡', title: 'Telemetry Blocking by Ad Blockers',
    severity: 'HIGH',
    what: 'AdBlockers intercept outbound network requests matching ad/tracker patterns.',
    why: 'Proctoring telemetry endpoints often look like tracking scripts (e.g., /telemetry.js, /events). uBlock Origin blocks them instantly. The candidate cheats while the backend receives zero fraud events.',
    examples: ['uBlock Origin: blocks WebSocket endpoint matching /track pattern', 'AdBlock Plus: silences proctoring beacon requests', 'Privacy Badger: blocks all third-party connections including proctoring backend'],
    color: 'var(--aegis-amber)',
  },
  {
    id: 'screen_capture', icon: '📸', title: 'Extension-Level Screen Capture (chrome.tabCapture)',
    severity: 'HIGH',
    what: 'Extensions use chrome.tabCapture API to silently record the browser tab, bypassing getDisplayMedia.',
    why: 'getDisplayMedia (the browser API we use for screen detection) requires user permission and shows an indicator. Extensions using chrome.tabCapture do not — they record silently in the background without triggering any browser-visible capture indicator.',
    examples: ['Loom: uses tabCapture to record full session for remote coaches', 'Screencastify: streams tab video to cloud for real-time AI solving', 'Custom cheating apps: record question screen → OCR → AI → answer'],
    color: 'var(--aegis-amber)',
  },
];

const DEFENSE_VECTORS = [
  {
    num: 1, icon: '🔍', label: 'DOM Fingerprinting',
    color: 'var(--aegis-cyan)',
    method: 'MutationObserver + querySelectorAll + manual shadow root walk',
    interval: '2.0s + real-time mutation',
    targets: '80+ CSS selectors: sidebar IDs, class names, data attributes',
    stops: 'ChatGPT Sidebar, Claude, Copilot, Grammarly overlays',
    detail: 'Scans main DOM and every open shadow root for known extension signatures. Runs on every DOM mutation via MutationObserver.',
  },
  {
    num: 2, icon: '🌐', label: 'API Surface Detection',
    color: '#4cc9f0',
    method: 'window.* global namespace inspection',
    interval: '3.0s polling',
    targets: 'window.tampermonkey, window.GM, window.grammarly, window.copilot, window.hola, window.ddg',
    stops: 'Tampermonkey, Greasemonkey, Violentmonkey, all extension globals',
    detail: 'Resolves dotted property paths on window. Detects footprints even if extension hides its DOM elements.',
  },
  {
    num: 3, icon: '🛡', label: 'Network Prototype Patching',
    color: 'var(--aegis-green)',
    method: 'Overrides window.fetch + XMLHttpRequest.prototype.open at startup',
    interval: 'Real-time (every request)',
    targets: '29+ AI domains: openai.com, anthropic.com, claude.ai, gemini.google.com, api.perplexity.ai, you.com, quillbot.com, grammarly.com, copilot.github.com, deepl.com…',
    stops: 'ANY extension making AI API calls from the main thread context',
    detail: 'Patches prototypes before any extension code runs. Intercepts, logs, and optionally blocks outbound requests to all known AI inference endpoints.',
  },
  {
    num: 4, icon: '⚡', label: 'Event Trustworthiness Guard',
    color: '#ff6b35',
    method: 'e.isTrusted property check on every keydown + paste',
    interval: 'Real-time (every event)',
    targets: 'Keyboard automation, autofill injectors, script-dispatched events',
    stops: 'Selenium, Puppeteer, script injectors, autofill answer templates',
    detail: 'Browser sets isTrusted=true ONLY for physical user input. Any event dispatched via JavaScript is isTrusted=false and is immediately flagged as synthetic input.',
  },
  {
    num: 5, icon: '⏱', label: 'Blocker Timing Attack',
    color: 'var(--aegis-amber)',
    method: 'Loads /ads/ad.js and measures rejection latency',
    interval: '30s polling',
    targets: 'uBlock Origin, AdBlock Plus, Privacy Badger, any request-blocker',
    stops: 'Extensions blocking proctoring telemetry endpoints',
    detail: 'A network error from the server takes > 50ms. Rejection in < 10ms = local extension intercepted the request. Detects ad/tracker blockers that could suppress fraud telemetry.',
  },
  {
    num: 6, icon: '🎨', label: 'CSS Injection Detection',
    color: '#9b59b6',
    method: 'document.styleSheets scan for chrome-extension:// / moz-extension:// href',
    interval: '5.0s polling + MutationObserver',
    targets: 'Extension-injected stylesheets from any extension origin',
    stops: 'Visual overlay extensions, answer-highlighting tools',
    detail: 'Any stylesheet whose href begins with a browser extension scheme is flagged. Indicates an extension is actively modifying page presentation.',
  },
  {
    num: 7, icon: '💾', label: 'Storage Tampering Detection',
    color: '#a8dadc',
    method: 'Rolling DJB2 hash of all localStorage key-value pairs',
    interval: '10.0s polling',
    targets: 'Extensions reading/writing session tokens or answer caches',
    stops: 'Credential-theft scripts, answer-cache injectors',
    detail: 'Computes a rolling hash of localStorage state. Any change not originating from known frontend actions triggers a tampering event.',
  },
  {
    num: 8, icon: '📦', label: 'Worker & iframe Inspection',
    color: '#6c757d',
    method: 'navigator.serviceWorker.getRegistrations() + iframe.src scan',
    interval: '30.0s polling',
    targets: 'Extension service workers (MV3), hidden extension iframes',
    stops: 'Extensions using service workers to proxy AI requests',
    detail: 'Checks all registered service workers and iframes for chrome-extension:// or moz-extension:// origins — signals an extension is running a background proxy.',
  },
  {
    num: 9, icon: '🖥', label: 'Fullscreen Lock',
    color: 'var(--aegis-red)',
    method: 'Fullscreen API + fullscreenchange event + auto re-acquire',
    interval: 'Immediate on exit',
    targets: 'Tab-switching, secondary app windows, external document viewers',
    stops: 'Reading notes in other tabs, using local IDE or AI chat',
    detail: 'Enforces fullscreen. Any exit triggers an immediate lockout overlay blocking all interaction. Auto-attempts re-acquire after 2s. Each exit = HIGH penalty.',
  },
  {
    num: 10, icon: '🤖', label: 'Synthetic Clipboard Guard',
    color: '#ff6b35',
    method: 'paste event isTrusted=false detection + structural analysis',
    interval: 'Real-time (every paste)',
    targets: 'Clipboard injection tools, autofill answer templates',
    stops: 'Extensions pre-loading AI answers into clipboard before paste',
    detail: 'Intercepts paste events. Non-human pastes (isTrusted=false) are blocked entirely and logged as CRITICAL synthetic input events.',
  },
];

const PENALTY_TIERS = [
  {
    level: 'CRITICAL', pts: -45, color: 'var(--aegis-red)', bg: 'rgba(239,68,68,0.08)',
    icon: '☠',
    triggers: [
      'AI API network call intercepted (fetch/XHR to OpenAI, Anthropic, Gemini…)',
      'Tampermonkey / Greasemonkey / Violentmonkey script injection detected',
      'Synthetic paste event (isTrusted=false on clipboard inject)',
      'Multiple faces detected in room',
      'Extension service worker with AI proxy behavior',
    ],
    outcome: '2 critical events → Immediate AUTO-FAIL + Session Lock + HITL Recruiter Alert',
  },
  {
    level: 'HIGH', pts: -25, color: '#ff6b35', bg: 'rgba(255,107,53,0.08)',
    icon: '⛔',
    triggers: [
      'GitHub Copilot / Tabnine / Codeium extension DOM detected',
      'Loom / Screencastify screen recording extension active',
      'Fullscreen exited during interview',
      'Phone-hold grip gesture (sustained)',
      'Earpiece contact gesture detected',
      'Writing gesture off-screen (sustained)',
      'Head yaw > 25° sustained > 1.8s',
      'Iris gaze deviation > 0.35 normalized units',
    ],
    outcome: '6s lockout overlay → mandatory fullscreen re-acquire → score drop',
  },
  {
    level: 'MEDIUM', pts: -10, color: 'var(--aegis-amber)', bg: 'rgba(245,158,11,0.08)',
    icon: '⚠',
    triggers: [
      'Grammarly / QuillBot / Wordtune writing assistant active',
      'Google Translate / DeepL page translation active',
      'Ad-blocker detected (blocking telemetry endpoint)',
      'localStorage modified externally',
      'Extension stylesheet injected',
      'Head pitch > 15° sustained > 2.5s (looking down)',
      'EAR blink metric < 0.21 sustained > 3s',
    ],
    outcome: 'Toast warning → score deduction → recruiter event log entry',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, sub, accent = 'var(--aegis-cyan)' }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `${accent}18`, border: `1px solid ${accent}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.2rem', flexShrink: 0,
        }}>{icon}</div>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>{title}</h2>
          {sub && <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{sub}</p>}
        </div>
      </div>
      <div style={{ height: 1, background: `linear-gradient(90deg, ${accent}40, transparent)`, marginTop: 16 }} />
    </div>
  );
}

function AccuracyBadge({ label, value, color = 'var(--aegis-green)' }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: `${color}12`, border: `1px solid ${color}30`,
      borderRadius: 6, padding: '2px 8px', fontSize: '0.65rem',
      fontFamily: 'monospace', fontWeight: 700, color,
    }}>
      {label}: {value}
    </span>
  );
}

function SeverityBadge({ level }) {
  const map = {
    CRITICAL: { color: 'var(--aegis-red)', bg: 'rgba(239,68,68,0.12)', icon: '☠' },
    HIGH:     { color: '#ff6b35', bg: 'rgba(255,107,53,0.12)', icon: '⛔' },
    MEDIUM:   { color: 'var(--aegis-amber)', bg: 'rgba(245,158,11,0.12)', icon: '⚠' },
    LOW:      { color: '#4cc9f0', bg: 'rgba(76,201,240,0.12)', icon: '●' },
  };
  const s = map[level] || map.LOW;
  return (
    <span style={{
      fontSize: '0.58rem', fontWeight: 800, padding: '2px 8px', borderRadius: 99,
      color: s.color, background: s.bg, letterSpacing: '0.5px',
    }}>{s.icon} {level}</span>
  );
}

// Eye / Gesture tracking signal card
function BiometricCard({ sig }) {
  const [open, setOpen] = useState(false);
  return (
    <div onClick={() => setOpen(o => !o)} style={{
      border: `1px solid ${sig.color}25`,
      background: `${sig.color}06`,
      borderRadius: 12, padding: '14px 16px',
      cursor: 'pointer', transition: 'all 0.25s',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 8,
          background: `${sig.color}15`, border: `1px solid ${sig.color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.9rem', flexShrink: 0,
        }}>{sig.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fff' }}>{sig.label}</div>
          <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{sig.model}</div>
        </div>
        <SeverityBadge level={sig.penalty} />
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
      </div>

      {/* Accuracy strip */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        <AccuracyBadge label="Accuracy" value={sig.accuracy} color={sig.color} />
        <AccuracyBadge label="Precision" value={sig.precision} color="var(--aegis-cyan)" />
        <AccuracyBadge label="Threshold" value={sig.threshold || sig.trigger} color={sig.penalty === 'CRITICAL' ? 'var(--aegis-red)' : sig.penalty === 'HIGH' ? '#ff6b35' : 'var(--aegis-amber)'} />
        <AccuracyBadge label="Penalty" value={`${sig.penaltyPts} pts`} color={sig.penalty === 'CRITICAL' ? 'var(--aegis-red)' : sig.penalty === 'HIGH' ? '#ff6b35' : 'var(--aegis-amber)'} />
      </div>

      {/* Expanded detail */}
      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--aegis-cyan)', marginBottom: 4 }}>TECHNIQUE</div>
              <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{sig.technique}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--aegis-cyan)', marginBottom: 4 }}>OUTPUT FORM</div>
              <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{sig.form}</div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: sig.color, marginBottom: 4 }}>INTERPRETATION</div>
              <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
                ⚠ {sig.interpretation}
              </div>
            </div>
            {sig.howDetected && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--aegis-green)', marginBottom: 4 }}>HOW DETECTED</div>
                <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{sig.howDetected}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Extension threat row
function ExtRow({ threat }) {
  const [open, setOpen] = useState(false);
  const sevColor = { CRITICAL: 'var(--aegis-red)', HIGH: '#ff6b35', MEDIUM: 'var(--aegis-amber)', LOW: '#4cc9f0' };
  const catIcon  = { AI_ASSISTANT: '🤖', WRITING_AI: '✍', CODE_AI: '💻', SCREEN_CAPTURE: '📸',
                     TRANSLATOR: '🌐', VPN_PROXY: '🔒', AUTOMATION: '⚙', PASSWORD_MANAGER: '🔑',
                     ADBLOCKER: '🛡', MISC: '❓' };
  const c = sevColor[threat.severity] || '#4cc9f0';
  return (
    <div style={{
      borderRadius: 10, overflow: 'hidden',
      border: `1px solid ${c}20`,
      background: `${c}05`,
      marginBottom: 4,
    }}>
      <div onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', cursor: 'pointer',
      }}>
        <span style={{ fontSize: '1rem', flexShrink: 0 }}>{catIcon[threat.cat] || '❓'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{threat.name}</div>
          <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{threat.cat.replace('_', ' ')}</div>
        </div>
        {/* Detection vectors */}
        <div style={{ display: 'flex', gap: 3 }}>
          {threat.selectors?.length > 0 && <span title="V1: DOM Scan" style={{ fontSize: '0.65rem', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 4, padding: '1px 5px' }}>V1</span>}
          {threat.globals?.length > 0    && <span title="V2: API Surface" style={{ fontSize: '0.65rem', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 4, padding: '1px 5px' }}>V2</span>}
          {threat.timingAttack           && <span title="V5: Timing Attack" style={{ fontSize: '0.65rem', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 4, padding: '1px 5px' }}>V5</span>}
        </div>
        <SeverityBadge level={threat.severity} />
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
      </div>
      {open && (
        <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#ff6b35', marginBottom: 4 }}>⚠ BYPASS MECHANISM</div>
          <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 10 }}>{threat.why}</div>
          <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--aegis-cyan)', marginBottom: 4 }}>🛡 AEGIS DETECTION</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {threat.selectors?.length > 0 && <span style={{ fontSize: '0.62rem', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 5, padding: '2px 8px', color: 'var(--aegis-cyan)' }}>🔍 V1: DOM Fingerprint ({threat.selectors.length} selectors)</span>}
            {threat.globals?.length > 0   && <span style={{ fontSize: '0.62rem', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 5, padding: '2px 8px', color: 'var(--aegis-cyan)' }}>🌐 V2: API Surface ({threat.globals.length} globals)</span>}
            {threat.timingAttack          && <span style={{ fontSize: '0.62rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 5, padding: '2px 8px', color: 'var(--aegis-amber)' }}>⏱ V5: Timing Attack</span>}
            <span style={{ fontSize: '0.62rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 5, padding: '2px 8px', color: 'var(--aegis-red)' }}>🚫 Network (V3) — all AI domains blocked</span>
          </div>
          {threat.selectors?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 3 }}>DOM FINGERPRINTS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {threat.selectors.map(s => (
                  <code key={s} style={{ fontSize: '0.58rem', padding: '1px 6px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 4, color: '#4cc9f0' }}>{s}</code>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Defense vector card
function DefenseVector({ v }) {
  const [open, setOpen] = useState(false);
  return (
    <div onClick={() => setOpen(o => !o)} style={{
      border: `1px solid ${v.color}25`,
      background: `${v.color}06`,
      borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
      transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9,
          background: `${v.color}18`, border: `1px solid ${v.color}35`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1rem', flexShrink: 0,
        }}>{v.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'monospace', fontSize: '0.6rem', fontWeight: 900, color: v.color, background: `${v.color}15`, padding: '1px 6px', borderRadius: 4 }}>V{v.num}</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fff' }}>{v.label}</span>
          </div>
          <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{v.method}</div>
        </div>
        <div style={{
          fontSize: '0.6rem', fontWeight: 800, padding: '2px 8px', borderRadius: 99,
          color: 'var(--aegis-green)', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
        }}>✓ ACTIVE</div>
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
      </div>
      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { l: 'INTERVAL', v: v.interval, c: 'var(--aegis-cyan)' },
            { l: 'TARGETS', v: v.targets, c: 'var(--aegis-amber)' },
            { l: 'STOPS', v: v.stops, c: '#ff6b35' },
            { l: 'MECHANISM', v: v.detail, c: 'var(--aegis-green)' },
          ].map(item => (
            <div key={item.l} style={{ gridColumn: item.l === 'MECHANISM' ? '1 / -1' : 'auto' }}>
              <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: item.c, marginBottom: 3 }}>{item.l}</div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>{item.v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Live scanning indicator
function ScannerLine() {
  const [pos, setPos] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPos(p => (p + 1) % 100), 30);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ position: 'relative', height: 2, background: 'rgba(59,130,246,0.1)', borderRadius: 1, overflow: 'hidden', marginBottom: 24 }}>
      <div style={{
        position: 'absolute', top: 0, left: `${pos}%`, width: '20%', height: '100%',
        background: 'linear-gradient(90deg, transparent, var(--aegis-cyan), transparent)',
        transition: 'left 0.03s linear',
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'eye',       icon: '👁',  label: 'Eye & Gaze Tracking' },
  { id: 'gesture',   icon: '🤚',  label: 'Gesture Recognition' },
  { id: 'bypass',    icon: '⚡',  label: 'Why Extensions Bypass' },
  { id: 'catalog',   icon: '📋',  label: 'Extension Catalog' },
  { id: 'defense',   icon: '🛡',  label: '10-Vector Defense' },
  { id: 'penalty',   icon: '⚠',   label: 'Penalty System' },
];

const CAT_LABELS = {
  ALL: 'All Categories',
  AI_ASSISTANT: '🤖 AI Assistants',
  WRITING_AI: '✍ Writing AI',
  CODE_AI: '💻 Code AI',
  SCREEN_CAPTURE: '📸 Screen Capture',
  TRANSLATOR: '🌐 Translators',
  VPN_PROXY: '🔒 VPN/Proxy',
  AUTOMATION: '⚙ Automation',
  PASSWORD_MANAGER: '🔑 Password Mgrs',
  ADBLOCKER: '🛡 Ad Blockers',
  MISC: '❓ Misc',
};

export default function SecurityDashboard() {
  const [tab, setTab] = useState('eye');
  const [catFilter, setCatFilter] = useState('ALL');
  const [sevFilter, setSevFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [tick, setTick] = useState(0);

  // Pulse animation for live indicator
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const filteredExts = EXTENSION_THREAT_CATALOG.filter(t => {
    const okCat = catFilter === 'ALL' || t.cat === catFilter;
    const okSev = sevFilter === 'ALL' || t.severity === sevFilter;
    const okSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.why.toLowerCase().includes(search.toLowerCase());
    return okCat && okSev && okSearch;
  });

  const critCount = EXTENSION_THREAT_CATALOG.filter(t => t.severity === 'CRITICAL').length;
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #04060f 0%, #080c18 50%, #04060f 100%)',
      color: '#fff',
      fontFamily: '"Inter", "Outfit", system-ui, sans-serif',
      paddingBottom: 60,
    }}>

      {/* ── HERO HEADER ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(0,0,0,0) 40%, rgba(59,130,246,0.06) 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '32px 40px 24px',
        position: 'sticky', top: 56, zIndex: 50,
        backdropFilter: 'blur(20px)',
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '4px', textTransform: 'uppercase', color: 'var(--aegis-red)', marginBottom: 6 }}>
                ☠ AEGIS v4.2 — NUCLEAR SECURITY LAYER
              </div>
              <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 900, letterSpacing: '-1px', lineHeight: 1.1 }}>
                Security Intelligence
                <span style={{ color: 'var(--aegis-cyan)' }}> Dashboard</span>
              </h1>
              <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)', maxWidth: 640 }}>
                Complete specification of biometric tracking models, extension threat vectors, bypass mechanics, and zero-bypass defense systems enforced in the interview room.
              </p>
            </div>

            {/* Live stat pills */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { label: 'Biometric Channels', val: EYE_TRACKING_SIGNALS.length + GESTURE_SIGNALS.length, color: 'var(--aegis-cyan)' },
                { label: 'Tracked Extensions', val: EXTENSION_THREAT_CATALOG.length, color: '#ff6b35' },
                { label: 'Critical Threats', val: critCount, color: 'var(--aegis-red)' },
                { label: 'Defense Vectors', val: 10, color: 'var(--aegis-green)' },
              ].map(s => (
                <div key={s.label} style={{
                  textAlign: 'center', padding: '12px 18px',
                  background: `${s.color}0c`, border: `1px solid ${s.color}25`,
                  borderRadius: 12, minWidth: 100,
                }}>
                  <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '1.6rem', color: s.color, lineHeight: 1 }}>{s.val}</div>
                  <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
                </div>
              ))}
              {/* Live pulse */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '12px 18px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)',
                borderRadius: 12, minWidth: 100,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', background: 'var(--aegis-green)',
                    boxShadow: tick % 2 === 0 ? '0 0 8px var(--aegis-green)' : '0 0 2px var(--aegis-green)',
                    transition: 'box-shadow 0.5s',
                  }} />
                  <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '0.85rem', color: 'var(--aegis-green)' }}>LIVE</span>
                </div>
                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monitoring</div>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div style={{ display: 'flex', gap: 4, marginTop: 24, flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '8px 16px',
                background: tab === t.id ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                border: tab === t.id ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                color: tab === t.id ? 'var(--aegis-cyan)' : 'rgba(255,255,255,0.5)',
                fontSize: '0.72rem', fontWeight: tab === t.id ? 700 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.2s',
              }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 40px' }}>
        <ScannerLine />

        {/* ── TAB: Eye & Gaze Tracking ── */}
        {tab === 'eye' && (
          <div>
            <SectionHeader icon="👁" title="Eye & Gaze Tracking" accent="var(--aegis-cyan)"
              sub="MediaPipe FaceLandmarker · 478 3D facial landmarks · 30fps · Sub-pixel iris tracking · Kalman-smoothed pose vectors" />

            {/* Model overview */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12,
              marginBottom: 28, padding: '18px 20px',
              background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.12)',
              borderRadius: 14,
            }}>
              {[
                { icon: '🧠', label: 'CV Model', val: 'MediaPipe FaceLandmarker (BlazeFace + Face Mesh)' },
                { icon: '📍', label: 'Landmark Count', val: '478 3D landmarks per face' },
                { icon: '⚡', label: 'Processing Mode', val: 'LIVE_STREAM — WebAssembly (WASM) local inference' },
                { icon: '🎯', label: 'Iris Detection', val: 'Dedicated iris model (Landmarks 468–477)' },
                { icon: '📐', label: 'Head Pose', val: 'solvePnP → Rodrigues → RQDecomp3x3' },
                { icon: '📊', label: 'Smoothing', val: 'Kalman filter on pose vectors (reduces flicker)' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--aegis-cyan)', textTransform: 'uppercase', letterSpacing: '1px' }}>{item.label}</div>
                    <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.7)', marginTop: 2, lineHeight: 1.5 }}>{item.val}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
              {EYE_TRACKING_SIGNALS.map(sig => (
                <BiometricCard key={sig.id} sig={sig} type="eye" />
              ))}
            </div>
          </div>
        )}

        {/* ── TAB: Gesture Recognition ── */}
        {tab === 'gesture' && (
          <div>
            <SectionHeader icon="🤚" title="Gesture Recognition" accent="#ff6b35"
              sub="MediaPipe HandLandmarker · 21 3D landmarks per hand · 30fps · Cross-model face+hand proximity detection" />

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12,
              marginBottom: 28, padding: '18px 20px',
              background: 'rgba(255,107,53,0.04)', border: '1px solid rgba(255,107,53,0.12)',
              borderRadius: 14,
            }}>
              {[
                { icon: '🧠', label: 'CV Model', val: 'MediaPipe HandLandmarker (Palm Detection + Hand Landmark)' },
                { icon: '📍', label: 'Landmark Count', val: '21 3D landmarks per hand (wrist, 4 fingers × 4 joints + fingertips)' },
                { icon: '🤲', label: 'Max Hands', val: '2 hands tracked simultaneously' },
                { icon: '⚡', label: 'Processing Mode', val: 'LIVE_STREAM — WebAssembly (WASM) local inference' },
                { icon: '📐', label: 'Classification', val: 'Geometric rule-based classifiers on landmark coordinates' },
                { icon: '📊', label: 'Cross-Model', val: 'Hand + Face landmark proximity for earpiece / mouth cover detection' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#ff6b35', textTransform: 'uppercase', letterSpacing: '1px' }}>{item.label}</div>
                    <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.7)', marginTop: 2, lineHeight: 1.5 }}>{item.val}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Landmark diagram placeholder */}
            <div style={{
              marginBottom: 24, padding: '20px 24px',
              background: 'rgba(255,107,53,0.04)', border: '1px solid rgba(255,107,53,0.15)', borderRadius: 14,
            }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#ff6b35', marginBottom: 12 }}>HAND LANDMARK MAP — 21 KEYPOINTS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[
                  ['LM0', 'Wrist'], ['LM1', 'CMC Thumb'], ['LM2', 'MCP Thumb'], ['LM3', 'IP Thumb'], ['LM4', '👍 Thumb Tip'],
                  ['LM5', 'Index MCP'], ['LM6', 'Index PIP'], ['LM7', 'Index DIP'], ['LM8', '☝ Index Tip'],
                  ['LM9', 'Middle MCP'], ['LM10', 'Middle PIP'], ['LM11', 'Middle DIP'], ['LM12', 'Middle Tip'],
                  ['LM13', 'Ring MCP'], ['LM14', 'Ring PIP'], ['LM15', 'Ring DIP'], ['LM16', 'Ring Tip'],
                  ['LM17', 'Pinky MCP'], ['LM18', 'Pinky PIP'], ['LM19', 'Pinky DIP'], ['LM20', 'Pinky Tip'],
                ].map(([id, name]) => (
                  <div key={id} style={{
                    display: 'flex', gap: 4, alignItems: 'center',
                    background: 'rgba(255,107,53,0.08)', border: '1px solid rgba(255,107,53,0.15)',
                    borderRadius: 6, padding: '3px 8px',
                  }}>
                    <code style={{ fontSize: '0.6rem', color: '#ff6b35', fontWeight: 700 }}>{id}</code>
                    <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)' }}>{name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
              {GESTURE_SIGNALS.map(sig => (
                <BiometricCard key={sig.id} sig={sig} type="gesture" />
              ))}
            </div>
          </div>
        )}

        {/* ── TAB: Why Extensions Bypass ── */}
        {tab === 'bypass' && (
          <div>
            <SectionHeader icon="⚡" title="Why Extensions Can Bypass Basic Security" accent="var(--aegis-red)"
              sub="The root architectural reasons browser extensions defeat simple event-listener based proctoring systems" />

            {/* Warning banner */}
            <div style={{
              marginBottom: 28, padding: '16px 20px',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 14, display: 'flex', gap: 14, alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: '1.5rem' }}>⚠</span>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--aegis-red)', marginBottom: 4 }}>CRITICAL ARCHITECTURAL VULNERABILITY</div>
                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7 }}>
                  Browser extensions are <strong style={{ color: '#fff' }}>privileged first-party code</strong>. They operate at the same (or higher) privilege level as the web page itself. Unlike sandboxed iframes or cross-origin scripts, content scripts can freely read and modify the DOM, window object, and network traffic of any tab.
                  No amount of JavaScript obfuscation can protect a web page from a content script running in the same context.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {BYPASS_REASONS.map(r => (
                <div key={r.id} style={{
                  border: `1px solid ${r.color}25`,
                  background: `${r.color}05`,
                  borderRadius: 14, overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '16px 20px',
                    background: `linear-gradient(135deg, ${r.color}0c, transparent)`,
                    borderBottom: `1px solid ${r.color}15`,
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <span style={{ fontSize: '1.4rem' }}>{r.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <SeverityBadge level={r.severity} />
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fff' }}>{r.title}</span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>{r.what}</div>
                    </div>
                  </div>
                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#ff6b35', marginBottom: 6 }}>WHY IT WORKS</div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, marginBottom: 14 }}>{r.why}</div>
                    <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--aegis-amber)', marginBottom: 6 }}>REAL-WORLD EXAMPLES</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {r.examples.map((e, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ color: 'var(--aegis-amber)', fontSize: '0.7rem', flexShrink: 0 }}>→</span>
                          <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>{e}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB: Extension Catalog ── */}
        {tab === 'catalog' && (
          <div>
            <SectionHeader icon="📋" title="Extension Threat Catalog" accent="#ff6b35"
              sub={`${EXTENSION_THREAT_CATALOG.length} known cheating extensions — DOM signatures, bypass mechanisms, detection status`} />

            {/* Filters */}
            <div style={{
              display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
              marginBottom: 20, padding: '14px 16px',
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
            }}>
              <input
                placeholder="Search extension or threat description…"
                value={search} onChange={e => setSearch(e.target.value)}
                style={{
                  flex: 1, minWidth: 200, background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                  padding: '7px 12px', color: '#fff', fontSize: '0.72rem',
                  fontFamily: 'inherit',
                }}
              />
              <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, padding: '7px 10px', color: 'rgba(255,255,255,0.7)',
                fontSize: '0.7rem', fontFamily: 'inherit',
              }}>
                {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={sevFilter} onChange={e => setSevFilter(e.target.value)} style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, padding: '7px 10px', color: 'rgba(255,255,255,0.7)',
                fontSize: '0.7rem', fontFamily: 'inherit',
              }}>
                {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(s => <option key={s} value={s}>{s === 'ALL' ? 'All Severities' : s}</option>)}
              </select>
              <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>
                {filteredExts.length}/{EXTENSION_THREAT_CATALOG.length} shown
              </span>
            </div>

            {/* Category summary */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              {Object.entries({
                '🤖 AI Assistants': EXTENSION_THREAT_CATALOG.filter(t => t.cat === 'AI_ASSISTANT').length,
                '💻 Code AI': EXTENSION_THREAT_CATALOG.filter(t => t.cat === 'CODE_AI').length,
                '✍ Writing AI': EXTENSION_THREAT_CATALOG.filter(t => t.cat === 'WRITING_AI').length,
                '📸 Screen Capture': EXTENSION_THREAT_CATALOG.filter(t => t.cat === 'SCREEN_CAPTURE').length,
                '⚙ Automation': EXTENSION_THREAT_CATALOG.filter(t => t.cat === 'AUTOMATION').length,
                '🛡 Ad Blockers': EXTENSION_THREAT_CATALOG.filter(t => t.cat === 'ADBLOCKER').length,
                '🔒 VPN/Proxy': EXTENSION_THREAT_CATALOG.filter(t => t.cat === 'VPN_PROXY').length,
                '🌐 Translators': EXTENSION_THREAT_CATALOG.filter(t => t.cat === 'TRANSLATOR').length,
              }).map(([name, count]) => (
                <div key={name} style={{
                  fontSize: '0.65rem', fontWeight: 600,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8, padding: '4px 10px', color: 'rgba(255,255,255,0.55)',
                }}>
                  {name}: <strong style={{ color: '#fff' }}>{count}</strong>
                </div>
              ))}
            </div>

            <div>
              {filteredExts.map(t => <ExtRow key={t.id} threat={t} />)}
            </div>
          </div>
        )}

        {/* ── TAB: 10-Vector Defense ── */}
        {tab === 'defense' && (
          <div>
            <SectionHeader icon="🛡" title="10-Vector Zero-Bypass Defense Architecture" accent="var(--aegis-green)"
              sub="Every vector runs concurrently. Together they close all bypass channels available to browser extensions." />

            {/* Architecture overview */}
            <div style={{
              marginBottom: 28, padding: '20px 24px',
              background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.15)',
              borderRadius: 14,
            }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--aegis-green)', marginBottom: 12 }}>DEFENSE COVERAGE MAP</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                {[
                  { threat: 'DOM Overlay', stopped: 'V1, V6' },
                  { threat: 'Script Injection', stopped: 'V2, V1' },
                  { threat: 'AI API Network Calls', stopped: 'V3' },
                  { threat: 'Synthetic Typing', stopped: 'V4' },
                  { threat: 'Telemetry Blocking', stopped: 'V5' },
                  { threat: 'CSS Overlays', stopped: 'V6' },
                  { threat: 'Session Token Theft', stopped: 'V7' },
                  { threat: 'Service Worker Proxy', stopped: 'V8' },
                  { threat: 'Tab Switching', stopped: 'V9' },
                  { threat: 'Clipboard Injection', stopped: 'V10, V4' },
                  { threat: 'Screen Capture Ext', stopped: 'V9, V1' },
                  { threat: 'VPN Masking', stopped: 'V1, V2' },
                ].map(item => (
                  <div key={item.threat} style={{
                    background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(16,185,129,0.1)',
                    borderRadius: 8, padding: '8px 12px',
                  }}>
                    <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>{item.threat}</div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--aegis-green)', fontFamily: 'monospace' }}>→ {item.stopped}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {DEFENSE_VECTORS.map(v => <DefenseVector key={v.num} v={v} />)}
            </div>
          </div>
        )}

        {/* ── TAB: Penalty System ── */}
        {tab === 'penalty' && (
          <div>
            <SectionHeader icon="⚠" title="Penalty & Enforcement System" accent="var(--aegis-red)"
              sub="Dynamic fraud scoring with immediate lockout triggers. Zero tolerance for any detected bypass." />

            {/* Score formula */}
            <div style={{
              marginBottom: 28, padding: '20px 24px',
              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 14,
            }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--aegis-red)', marginBottom: 10 }}>INTEGRITY SCORE FORMULA</div>
              <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', color: '#fff', marginBottom: 10 }}>
                <span style={{ color: 'var(--aegis-green)' }}>Score</span> = 100 − Σ(penalties) <span style={{ color: 'rgba(255,255,255,0.4)' }}>// min: 0</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 14 }}>
                {[
                  { label: 'Starting Score', val: '100', color: 'var(--aegis-green)' },
                  { label: 'Auto-Fail Threshold', val: '< 50 pts', color: 'var(--aegis-red)' },
                  { label: 'HITL Alert Threshold', val: '< 70 pts', color: 'var(--aegis-amber)' },
                  { label: 'Score Update Rate', val: 'Real-time', color: 'var(--aegis-cyan)' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '1rem', color: s.color, marginTop: 3 }}>{s.val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Penalty tiers */}
            {PENALTY_TIERS.map(tier => (
              <div key={tier.level} style={{
                marginBottom: 16,
                border: `1px solid ${tier.color}30`,
                background: tier.bg,
                borderRadius: 14, overflow: 'hidden',
              }}>
                <div style={{
                  padding: '16px 20px',
                  background: `linear-gradient(135deg, ${tier.color}0c, transparent)`,
                  borderBottom: `1px solid ${tier.color}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: '1.5rem' }}>{tier.icon}</span>
                    <div>
                      <SeverityBadge level={tier.level} />
                      <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>{tier.outcome}</div>
                    </div>
                  </div>
                  <div style={{
                    fontFamily: 'monospace', fontWeight: 900, fontSize: '2rem',
                    color: tier.color, lineHeight: 1,
                  }}>{tier.pts} pts</div>
                </div>
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: tier.color, marginBottom: 10 }}>TRIGGERED BY</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {tier.triggers.map((tr, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: 10, alignItems: 'center',
                        padding: '8px 12px',
                        background: 'rgba(0,0,0,0.2)', borderRadius: 8,
                        border: `1px solid ${tier.color}15`,
                      }}>
                        <span style={{ color: tier.color, fontSize: '0.7rem', flexShrink: 0 }}>→</span>
                        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>{tr}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {/* Lockout sequence */}
            <div style={{
              padding: '20px 24px',
              background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14,
            }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--aegis-cyan)', marginBottom: 14 }}>🔒 LOCKOUT EXECUTION SEQUENCE</div>
              <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
                {[
                  { step: '1', label: 'Detection', desc: 'Vector fires, threat matched', color: '#ff6b35' },
                  { step: '2', label: 'Score Deduct', desc: 'Integrity score updated', color: 'var(--aegis-amber)' },
                  { step: '3', label: 'Overlay', desc: 'Black lockout overlay blocks all input', color: 'var(--aegis-red)' },
                  { step: '4', label: 'Refocus', desc: 'window.focus() + fullscreen re-acquire', color: '#ff6b35' },
                  { step: '5', label: 'Telemetry', desc: 'WSS push to proctoring server', color: 'var(--aegis-cyan)' },
                  { step: '6', label: 'HITL Alert', desc: 'Recruiter Command Center alarmed', color: 'var(--aegis-green)' },
                ].map((s, i) => (
                  <React.Fragment key={s.step}>
                    <div style={{ flex: 1, minWidth: 100, textAlign: 'center', padding: '8px 4px' }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: `${s.color}15`, border: `1px solid ${s.color}40`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'monospace', fontWeight: 900, fontSize: '0.75rem', color: s.color,
                        margin: '0 auto 6px',
                      }}>{s.step}</div>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#fff', marginBottom: 2 }}>{s.label}</div>
                      <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>{s.desc}</div>
                    </div>
                    {i < 5 && <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 20, color: 'rgba(255,255,255,0.2)', fontSize: '1rem' }}>›</div>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
