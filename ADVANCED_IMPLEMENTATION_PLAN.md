# Aegis Interview Platform — Advanced Implementation Plan v5.0

> **Generated after deep architectural analysis of 40+ backend agents/engines, 40+ frontend components/hooks, 9 specification documents, and 92 identified defects.**
> This plan integrates state-of-the-art research in biometric liveness (PLR/rPPG/Kinematic), zero-bypass extension security, 12-layer protocol enforcement, and hybrid edge-cloud inference architecture.

---

## Executive Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            AEGIS v5.0 ADVANCED ARCHITECTURE                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌───────────────────┐    ┌──────────────────────────────┐  │
│  │  Lux UI   │───▶│  Phase Router     │───▶│  InterviewArena              │  │
│  │(Landing)  │    │(App.jsx)          │    │  - GazeEntropy               │  │
│  └──────────┘    └───────────────────┘    │  - ResponseTiming             │  │
│                                            │  - LLM Phrase Detection       │  │
│  ┌──────────┐    ┌───────────────────┐    │  - AudioForensics             │  │
│  │ Zero-    │───▶│ Security Hooks    │───▶│  - Keystroke Dynamics         │  │
│  │ Bypass   │    │(10-Vector Shield) │    │  - rPPG/PLR Liveness          │  │
│  │Engine    │    └───────────────────┘    │  - Speaker Verification        │  │
│  └──────────┘                             │  - Nuclear Lockdown            │  │
│                                           └───────┬──────────────────────┘  │
│  ┌──────────┐    ┌───────────────────┐           │                         │
│  │ Command  │◀───│ WebSocket Bridge  │◀──────────┘                         │
│  │ Center   │    │ (3 WS endpoints)  │                                      │
│  └──────────┘    └───────┬───────────┘                                      │
│                          │                                                  │
│           ┌──────────────┼──────────────────────────────┐                   │
│           ▼              ▼              ▼               ▼                   │
│  ┌────────────┐ ┌──────────────┐ ┌────────────┐ ┌──────────────┐          │
│  │ ws_cv      │ │ ws_interview │ │ ws_recruiter│ │ REST API     │          │
│  │ (CV Pipe)  │ │ (Hub: Aria)  │ │ (HITL)     │ │ (Auth/Data)  │          │
│  └──────┬─────┘ └──────┬───────┘ └────────────┘ └──────────────┘          │
│         │              │                                                    │
│         ▼              ▼                                                    │
│  ┌─────────────────────────────────────────────┐                          │
│  │            AGENT ORCHESTRATION              │                          │
│  │  ┌───────────┐ ┌──────────┐ ┌───────────┐  │                          │
│  │  │CVAgent    │ │FraudAgent│ │AudioAgent │  │                          │
│  │  │(Spoke)    │ │(Spoke)   │ │(Spoke)    │  │                          │
│  │  ├───────────┤ ├──────────┤ ├───────────┤  │                          │
│  │  │BiasAgent  │ │CodeReview│ │MemoryAgent│  │                          │
│  │  │(Spoke)    │ │(Spoke)   │ │(Spoke)    │  │                          │
│  │  └───────────┘ └──────────┘ └───────────┘  │                          │
│  └─────────────────────────────────────────────┘                          │
│         │              │                                                    │
│         ▼              ▼                                                    │
│  ┌─────────────────────────────────────────────┐                          │
│  │        FORENSIC ENGINE SUITE (v5)           │                          │
│  │  M8: KS-Test Gaze Baseline                 │                          │
│  │  M7: Whitespace Fixation Detector           │                          │
│  │  M6: PLR + rPPG Liveness Engine            │                          │
│  │  M6B: Kinematic Gaze Liveness Engine        │                          │
│  │  M9: Five-Channel Fusion Engine             │                          │
│  │  5CH: Security Engine Suite                 │                          │
│  └─────────────────────────────────────────────┘                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## PHASE 0 — CRITICAL FOUNDATIONAL FIXES (Week 1-2)

### 0.1 Security Vulnerabilities (S-1 through S-10)

#### S-1: WebSocket Accept-Before-Auth [CRITICAL]
**Current state:** Already partially fixed in `ws_cv`, `ws_interview`, `ws_recruiter` — auth happens before accept.
**Remaining:** Validate that ALL three endpoints (`main.py:621, 814, 995`) consistently close with code 4003 on auth failure, not 1000.

```python
# Verification checklist for main.py:
# ws_cv:     line 621 — auth before accept ✓
# ws_interview: line 814 — auth before accept ✓
# ws_recruiter: line 995 — auth before accept ✓
# BUT verify: await websocket.close(code=4003, reason="...") is used, not 1000
```

#### S-2: SKIP_AUTH Bypass [CRITICAL]
**Fix:** Enforce `SKIP_AUTH = False` in production. Add `FAIL_SECURE` env var that throws `RuntimeError` if `SKIP_AUTH` is non-zero.

#### S-3: JWT in WebSocket Query Params [CRITICAL]
**Fix:** Accept tokens ONLY via `Sec-WebSocket-Protocol` header. Reject query-param tokens entirely after migration.

#### S-4: No Authorization on Integrity Reports [CRITICAL]
**Status:** `main.py:1265` — `require_session_access` exists. Verify it's applied to ALL artifact/integrity endpoints.

#### S-5 to S-10: Remaining Security Fixes
Apply fixes per `IMPLEMENTATION_PLAN.md` Phase 0 with zero exemptions.

### 0.2 Critical Runtime Bugs (R-1 through R-10)

#### R-1: MediaPipe Face Landmark Indices
**Current bug:** `main.py:578-579` uses `lms[0]` and `lms[17]` for lip detection on MediaPipe 478-point model.
**Fix:** Verify against MediaPipe canonical topology — indices 13/14 are inner upper/lower lip in 478-point model:
```python
upper_lip = lms[13]  # inner upper lip center
lower_lip = lms[14]  # inner lower lip center
```

#### R-2: KS Test Misuse in hub.py
**Fix implemented:** `hub.py:228-237` now buffers x and y separately and tests each independently.

#### R-3 through R-10: Apply remaining fixes per original plan.

---

## PHASE 1 — ADVANCED KINEMATIC & BIOMETRIC ENGINE (Week 3-4)

### 1.1 KinematicGazeLivenessEngine — Production Hardening

**Research Basis:** Head micro-tremor variance (0.02°–0.5° SD) + green-channel rPPG at 0.9–2.2 Hz

**Current state:** `forensic_engine.py:366-537` — Core logic works. Needs hardening.

#### Implementation:
```python
# backend-cv/agents/forensic_engine.py — Enhanced KinematicGazeLivenessEngine

class KinematicGazeLivenessEngine:
    def __init__(self, challenge_duration_sec: float = 10.0):
        self.duration = challenge_duration_sec
        self.buffer: List[Tuple[float, float, float, float, Tuple[float, float, float]]] = []
        self._last_fft_time: float = 0.0
        self._consecutive_failures = 0
        self._consecutive_passes = 0
        
        # Kalman filter for tremor noise reduction
        self._tremor_kf = {
            'yaw': KalmanFilter(2, 1),
            'pitch': KalmanFilter(2, 1),
        }
        
    def process(self, obs: ForensicObservation) -> Optional[ForensicAlert]:
        # ... existing logic ...
        
        # NEW: Consecutive failure threshold — only alert after N consecutive failures
        if alert is not None:
            self._consecutive_failures += 1
            self._consecutive_passes = 0
            if self._consecutive_failures < 3:
                return None  # debounce
        else:
            self._consecutive_passes += 1
            self._consecutive_failures = 0
            
        return alert
```

#### Tests:
- **Live human simulation:** 250 frames with yaw/pitch micro-tremor (σ = 0.1°) + green-channel heartbeat at 1.2 Hz → **PASS** (no alert)
- **Static photo simulation:** 250 frames with yaw/pitch σ = 0.0° → **SPOOFING_ATTEMPT** alert
- **Frozen video replay:** 250 frames with yaw/pitch σ = 0.001° (< 0.005° threshold) → **TREMOR_FAIL** alert

### 1.2 PLRrPPGLivenessEngine — Screen Flash Restoration

**Research Basis:** Pupillary Light Reflex (PLR) requires controlled screen brightness cycling at 0.5–2.0 Hz with luminance transitions ≥ 0.5

**Current bug:** `main.py:710` maps `frame_brightness` (webcam ambient) to `screen_brightness_level`, but PLR evaluation at `forensic_engine.py:274` requires `b_curr - b_prev >= 0.5` which never occurs in static lighting.

#### Implementation Fix:

**Backend (`main.py:694-696`):**
```python
if stimulus_brightness is not None:
    result["stimulus_brightness"] = stimulus_brightness
# PLR fix: use stimulus_brightness if available
screen_brightness = result.get("stimulus_brightness", result.get("frame_brightness", 0.5))
```

**Frontend — PlrChallenge Integration (`LivenessChallenge.jsx`):**
```javascript
// During PLR challenge phase, send stimulus_brightness with every frame
const captureAndSend = () => {
    canvas.toBlob(blob => {
        const reader = new FileReader();
        reader.onload = () => {
            const payload = JSON.stringify({
                type: 'frame',
                data: reader.result.split(',')[1],
                stimulus_brightness: plrFlashBrightness, // 1.0 for flash, 0.0 for dark
            });
            cvWs.send(payload);
        };
        reader.readAsDataURL(blob);
    });
};
```

### 1.3 Kalman Filter Optimization for Gaze/Pose

**Current state:** `main.py:280-339` — Two KalmanFilter classes (pose + gaze) per WebSocket session.

**Optimization:**
```python
class UnifiedKalmanFilter:
    """Single 9-DOF Kalman filter for head pose + gaze."""
    def __init__(self):
        # State: [pitch, yaw, roll, gaze_h, gaze_v, dpitch, dyaw, droll, dgaze]
        self.kf = cv2.KalmanFilter(9, 6)
        dt = 1.0
        self.kf.transitionMatrix = np.array([
            [1,0,0,0,0,dt,0,0,0],
            [0,1,0,0,0,0,dt,0,0],
            [0,0,1,0,0,0,0,dt,0],
            [0,0,0,1,0,0,0,0,dt],
            [0,0,0,0,1,0,0,0,0],
            [0,0,0,0,0,1,0,0,0],
            [0,0,0,0,0,0,1,0,0],
            [0,0,0,0,0,0,0,1,0],
            [0,0,0,0,0,0,0,0,1],
        ], dtype=np.float32)
        # Measurement matrix maps: pitch, yaw, roll, gaze_h, gaze_v
        self.kf.measurementMatrix = np.array([
            [1,0,0,0,0,0,0,0,0],
            [0,1,0,0,0,0,0,0,0],
            [0,0,1,0,0,0,0,0,0],
            [0,0,0,1,0,0,0,0,0],
            [0,0,0,0,1,0,0,0,0],
        ], dtype=np.float32)
```

---

## PHASE 2 — ADVANCED AGENT ORCHESTRATION (Week 5-6)

### 2.1 AegisHub — Parallel Agent Dispatch with Circuit Breaker

**Current state:** Sequential agent invocation (`hub.py:410-523`) — each agent runs in series.

**Advanced Implementation:**
```python
import asyncio
from typing import Dict, Any, Optional
from dataclasses import dataclass, field

@dataclass
class AgentTask:
    agent_name: str
    coro: Any
    timeout: float = 5.0
    fallback: Any = None
    critical: bool = False

class AegisHub:
    async def _dispatch_parallel(self, tasks: Dict[str, AgentTask]) -> Dict[str, Any]:
        """Dispatch agents in parallel with per-agent timeouts and circuit breaker."""
        results = {}
        
        async def run_with_timeout(name: str, task: AgentTask):
            try:
                result = await asyncio.wait_for(task.coro, timeout=task.timeout)
                results[name] = {"status": "ok", "data": result}
                self._agent_circuit_breakers[name] = 0  # reset
            except asyncio.TimeoutError:
                log.warning("[Hub] Agent %s timed out after %ss", name, task.timeout)
                self._agent_circuit_breakers[name] += 1
                results[name] = {"status": "timeout", "data": task.fallback}
                if self._agent_circuit_breakers[name] >= 3:
                    log.error("[Hub] Circuit breaker TRIPPED for agent %s", name)
                    if task.critical:
                        raise RuntimeError(f"Critical agent {name} unavailable")
            except Exception as e:
                log.error("[Hub] Agent %s failed: %s", name, e)
                results[name] = {"status": "error", "data": task.fallback}
                
        await asyncio.gather(*[
            run_with_timeout(name, task) for name, task in tasks.items()
        ])
        return results
    
    async def think_and_respond(self, candidate_message: str) -> dict:
        # Parallel dispatch: bias audit + code review + fraud assessment
        parallel_tasks = {
            "bias_agent": AgentTask(
                agent_name="bias_agent",
                coro=self.bias_agent.audit(candidate_message),
                timeout=3.0,
                fallback=None,
            ),
            "fraud_check": AgentTask(
                agent_name="fraud_agent",
                coro=self.fraud_agent.compute_assessment(),
                timeout=2.0,
                fallback=None,
            ),
        }
        
        # Launch parallel agents while Aria generates response
        agent_future = asyncio.create_task(self._dispatch_parallel(parallel_tasks))
        
        # Generate Aria response (blocking on LLM)
        reply = await self._generate_aria_response(candidate_message)
        
        # Collect parallel results
        agent_results = await agent_future
        
        # Merge results into response
        reply["agent_results"] = agent_results
        return reply
```

### 2.2 Circuit Breaker Pattern for All Spoke Agents

```python
# backend-cv/agents/circuit_breaker.py (NEW)
import time
from typing import Dict, Callable, Any
from dataclasses import dataclass

@dataclass
class CircuitBreakerState:
    failures: int = 0
    last_failure_time: float = 0.0
    is_open: bool = False
    half_open_attempts: int = 0

class AgentCircuitBreaker:
    def __init__(self, threshold: int = 3, recovery_timeout: float = 30.0):
        self.threshold = threshold
        self.recovery_timeout = recovery_timeout
        self._states: Dict[str, CircuitBreakerState] = {}
        
    async def call(self, agent_name: str, fn: Callable, fallback: Any = None):
        state = self._states.setdefault(agent_name, CircuitBreakerState())
        
        if state.is_open:
            if time.time() - state.last_failure_time > self.recovery_timeout:
                state.is_open = False  # half-open
                state.half_open_attempts = 0
            else:
                return fallback  # fast fail
                
        try:
            result = await fn()
            state.failures = 0
            state.half_open_attempts = 0
            return result
        except Exception as e:
            state.failures += 1
            state.last_failure_time = time.time()
            if state.failures >= self.threshold:
                state.is_open = True
                log.warning("[CircuitBreaker] OPENED for agent %s", agent_name)
            return fallback
```

### 2.3 FraudAgent Enhancement — Real Anomaly Scoring by Session Duration

**Current bug:** `fraud_agent.py:93` — `session_duration_seconds` parameter is declared but never used.

```python
# backend-cv/agents/fraud_agent.py
def compute_assessment(self, session_duration_seconds: Optional[float] = None) -> FraudAssessment:
    if session_duration_seconds is None:
        session_duration_seconds = self._session_duration_seconds
    
    if session_duration_seconds <= 0:
        return FraudAssessment(
            fraud_score=0.0,
            verdict="INCONCLUSIVE",
            confidence=0.0,
        )
    
    # Normalize event frequency by session duration
    events_per_minute = (len(self._events) / session_duration_seconds) * 60.0
    high_severity_ratio = sum(1 for e in self._events if e.get("severity") == "HIGH") / max(len(self._events), 1)
    
    # Weighted scoring
    fraud_score = min(1.0, (
        events_per_minute * 0.15 +
        high_severity_ratio * 0.35 +
        self._calculate_signal_score() * 0.5
    ))
    
    verdict = "AUTHENTIC" if fraud_score < 0.3 else \
              "SUSPICIOUS" if fraud_score < 0.6 else \
              "LIKELY_FRAUD" if fraud_score < 0.85 else "CONFIRMED_FRAUD"
    
    return FraudAssessment(fraud_score=fraud_score, verdict=verdict, confidence=0.85)
```

---

## PHASE 3 — ADVANCED FUSION ENGINE & DECISION MATRIX (Week 7-8)

### 3.1 Five-Channel Fusion Engine — Complete Rewrite

**Research Basis:** N≥3 concurrent deviation rule from biometric fusion literature

**Current state:** `security_engine.py:242-282` — Accumulative, no windowing, severity only goes up.

```python
# backend-cv/agents/fusion_engine.py (RESTRUCTURED)

from dataclasses import dataclass, field
from collections import deque
import time
from typing import List, Dict, Optional, Tuple
from enum import Enum

class ActionLevel(Enum):
    SILENT_LOG = "SILENT_LOG"      # 1 channel
    LOW_LOG = "LOW_LOG"            # 2 channels
    MEDIUM_FLAG = "MEDIUM_FLAG"    # 3 channels
    HIGH_FLAG_REVIEW = "HIGH_FLAG_REVIEW"  # 4 channels
    CRITICAL_PAUSE = "CRITICAL_PAUSE"      # 5 channels

@dataclass
class ChannelPacket:
    channel: str       # GAZE | GESTURE | AUDIO | KEYSTROKE | ENVIRONMENT
    timestamp: float
    confidence: float  # 0.0 to 1.0
    description: str
    is_triggered: bool

@dataclass
class FusionDecision:
    action_level: str
    integrity_score_100: float
    active_channel_count: int
    triggered_channels: List[str]
    description: str

class FiveChannelFusionEngine:
    CHANNELS = ["GAZE", "GESTURE", "AUDIO", "KEYSTROKE", "ENVIRONMENT"]
    
    ACTION_THRESHOLDS = {
        1: ActionLevel.SILENT_LOG,
        2: ActionLevel.LOW_LOG,
        3: ActionLevel.MEDIUM_FLAG,
        4: ActionLevel.HIGH_FLAG_REVIEW,
        5: ActionLevel.CRITICAL_PAUSE,
    }
    
    def __init__(self, window_duration_sec: float = 10.0):
        self.window_duration = window_duration_sec
        self._packets: Dict[str, deque] = {
            ch: deque(maxlen=100) for ch in self.CHANNELS
        }
        self._last_cleanup = time.time()
        
    def process_packet(self, packet: ChannelPacket) -> FusionDecision:
        """Process a single channel packet and return fusion decision."""
        # Prune old entries periodically
        now = time.time()
        if now - self._last_cleanup > 5.0:
            self._prune_old(now)
            self._last_cleanup = now
            
        # Store packet
        self._packets[packet.channel].append(packet)
        
        # Evaluate active channels within window
        active_channels = []
        for ch in self.CHANNELS:
            recent = [p for p in self._packets[ch] if now - p.timestamp <= self.window_duration]
            triggered = [p for p in recent if p.is_triggered]
            if triggered:
                active_channels.append({
                    "channel": ch,
                    "count": len(triggered),
                    "max_confidence": max(p.confidence for p in triggered),
                    "description": triggered[-1].description,
                })
        
        n_active = len(active_channels)
        
        # Compute integrity score (weighted by channel confidence)
        if n_active == 0:
            integrity = 1.0
        else:
            total_confidence = sum(ch["max_confidence"] for ch in active_channels)
            integrity = max(0.0, 1.0 - (n_active * 0.12) - (total_confidence * 0.05))
        
        action = self.ACTION_THRESHOLDS.get(n_active, ActionLevel.SILENT_LOG)
        
        descriptions = [ch["description"] for ch in active_channels]
        
        return FusionDecision(
            action_level=action.value,
            integrity_score_100=round(integrity * 100, 1),
            active_channel_count=n_active,
            triggered_channels=[ch["channel"] for ch in active_channels],
            description=" | ".join(descriptions) if descriptions else "All channels nominal",
        )
    
    def _prune_old(self, now: float):
        for ch in self.CHANNELS:
            self._packets[ch] = deque(
                [p for p in self._packets[ch] if now - p.timestamp <= self.window_duration * 2],
                maxlen=100,
            )
```

### 3.2 Real-Time Integrity Score Formula Unification

**Current state:** 3 copies of `compute_integrity_score` in `hub.py`, `main.py`, `utils.py`.
**Fix:** Single source of truth in `agents/utils.py`.

```python
# backend-cv/agents/utils.py
def compute_integrity_score(events: list) -> int:
    """
    AEGIS Integrity Score Formula (unified).
    
    Base: 100
    CRITICAL: -45 per event (cap: 2 events → -90, triggers auto-fail)
    HIGH:      -25 per event
    MEDIUM:    -10 per event
    LOW:        -5 per event
    
    Floor: 0 (auto-fail)
    Threshold: < 50 → HITL escalation
    """
    weights = {"CRITICAL": 45, "HIGH": 25, "MEDIUM": 10, "LOW": 5}
    cap = {"CRITICAL": 2}  # max CRITICAL events counted
    
    deductions = {}
    for event in events:
        sev = event.severity if hasattr(event, 'severity') else event.get('severity', 'LOW')
        sev = sev.upper()
        count = deductions.get(sev, 0)
        max_count = cap.get(sev, float('inf'))
        if count < max_count:
            deductions[sev] = count + 1
    
    total_deduction = sum(
        weights.get(sev, 5) * count
        for sev, count in deductions.items()
    )
    
    return max(0, 100 - total_deduction)
```

---

## PHASE 4 — ADVANCED FRONTEND ARCHITECTURE (Week 9-10)

### 4.1 WebSocket Layer — Exponential Backoff Reconnection

**Current state:** `useWebSocket.js` — No reconnection logic. Queue drains to handler instead of WS.

```javascript
// frontend/src/useWebSocket.js (RESTRUCTURED)

import { useEffect, useRef, useCallback } from 'react';

const MAX_RETRIES = 10;
const BASE_DELAY = 1000;
const MAX_DELAY = 30000;

export function useWebSocket(url, onMessage) {
  const wsRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  const retryCountRef = useRef(0);
  const queueRef = useRef([]);
  const mountedRef = useRef(true);
  const reconnectTimerRef = useRef(null);
  
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryCountRef.current = 0;
      // Drain queue — actually send messages now
      while (queueRef.current.length > 0) {
        const msg = queueRef.current.shift();
        ws.send(msg);
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current?.(data);
      } catch {
        onMessageRef.current?.(event.data);
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      // Exponential backoff reconnection
      if (retryCountRef.current < MAX_RETRIES) {
        const delay = Math.min(
          BASE_DELAY * Math.pow(2, retryCountRef.current) + Math.random() * 1000,
          MAX_DELAY
        );
        retryCountRef.current += 1;
        reconnectTimerRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [url]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    } else {
      queueRef.current.push(data); // Queue for later
    }
  }, []);

  return { send, readyState: wsRef.current?.readyState };
}
```

### 4.2 useAegisStore — Reactive State Management

**Current bug:** `App.jsx:183-185` — `useAegisStore.getState().integrityScore` used directly in JSX prevents re-renders.

```javascript
// frontend/src/useAegisStore.js (SELECTIVE FIX)

// REPLACE all .getState() calls in JSX with reactive hooks:
// BEFORE (App.jsx):
// const { integrityScore } = useAegisStore.getState();
// 
// AFTER:
// const integrityScore = useAegisStore(s => s.integrityScore);

// Add selector optimization to prevent unnecessary re-renders:
export const useIntegrityScore = () => useAegisStore(s => s.integrityScore);
export const usePhase = () => useAegisStore(s => s.phase);
export const useMessages = () => useAegisStore(s => s.messages);
```

### 4.3 Zero-Bypass Extension Firewall — Real DOM/API Monitoring

The 10-vector security engine in `useDigitalSecurity.js` needs:

```javascript
// frontend/src/useDigitalSecurity.js — Add Vector 6: CSS Injection Scan

// V6: CSS Injection Audit (every 5s)
const cssScanTimer = useRef(null);

useEffect(() => {
  if (!enabled || phase !== 'interview') return;
  
  cssScanTimer.current = setInterval(() => {
    try {
      for (let i = 0; i < document.styleSheets.length; i++) {
        const sheet = document.styleSheets[i];
        if (sheet.href) {
          if (sheet.href.startsWith('chrome-extension://') ||
              sheet.href.startsWith('moz-extension://') ||
              sheet.href.startsWith('edge-extension://')) {
            triggerRiskEvent({
              type: 'EXTENSION_CSS_INJECTION',
              severity: 'HIGH',
              desc: `Extension CSS detected: ${sheet.href}`,
            });
          }
        }
      }
    } catch (e) {
      // CORS errors are expected — ignore
    }
  }, 5000);
  
  return () => clearInterval(cssScanTimer.current);
}, [enabled, phase]);
```

### 4.4 PlrChallenge — Full Integration

**Current state:** `PlrChallenge.jsx` (433 lines) has working flash cycle generation, eye ROI sampling, rPPG forehead sampling, sliding DFT heartbeat — **but is dead code** (never imported).

**Integration:**
```javascript
// frontend/src/LivenessChallenge.jsx — Integrate PlrChallenge as Step 2
import PlrChallenge from './PlrChallenge';

// In LivenessChallenge component:
const [livenessStep, setLivenessStep] = useState('gaze'); // gaze → plr → gotcha → done

// Render PlrChallenge when step is 'plr'
{livenessStep === 'plr' && (
  <PlrChallenge
    onComplete={(plrResult) => {
      setPlrPassed(plrResult.passed);
      setLivenessStep('gotcha');
    }}
    streamRef={streamRef}
  />
)}
```

---

## PHASE 5 — ADVANCED SECURITY HARDENING (Week 11-12)

### 5.1 Redis Security — Production Configuration

```python
# backend-cv/cache.py (HARDENED)
import os
import ssl

REDIS_URL = os.getenv("REDIS_URL", "")
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")
REDIS_TLS_ENABLED = os.getenv("REDIS_TLS", "").lower() in ("1", "true")

if not REDIS_URL:
    raise RuntimeError("REDIS_URL is required in production")

if REDIS_URL.startswith("redis://") and REDIS_TLS_ENABLED:
    REDIS_URL = REDIS_URL.replace("redis://", "rediss://")

redis_client = redis.from_url(
    REDIS_URL,
    password=REDIS_PASSWORD or None,
    socket_connect_timeout=5,
    socket_timeout=5,
    retry_on_timeout=True,
    health_check_interval=30,
)
```

### 5.2 Prometheus Cardinality Control

```python
# backend-cv/monitoring.py (HARDENED)
from prometheus_client import Counter, Histogram, Gauge
import re

# Strip dynamic path segments
_PATH_CLEANER = re.compile(r'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')

def clean_path(path: str) -> str:
    return _PATH_CLEANER.sub('/{uuid}', path)

# Use clean_path in middleware
@app.middleware("http")
async def prometheus_metrics(request, call_next):
    path = clean_path(request.url.path)
    # ... use cleaned path as label
```

### 5.3 Refresh Token Rotation

```python
# backend-cv/auth.py (ALREADY IMPLEMENTED — verify)
# Line 1219-1241: Refresh token rotation with mark_refresh_token_used(jti)
# Verify jti is included in refresh token payload
```

---

## PHASE 6 — ADVANCED CODE QUALITY & TESTING (Week 13-14)

### 6.1 Integration Test Suite — Forensic Engine

```python
# backend-cv/tests/test_advanced_forensic.py (NEW)

import pytest
import numpy as np
from agents.forensic_engine import (
    KSTestBaselineEngine,
    WhitespaceFixationDetector,
    KinematicGazeLivenessEngine,
    PLRrPPGLivenessEngine,
    ForensicObservation,
)

class TestForensicEngineSuite:
    
    def test_ks_test_audio_suppression(self):
        """Verify contextual suppression during speech."""
        engine = KSTestBaselineEngine(calibration_duration_sec=2.0, window_duration_sec=1.0)
        
        # Calibrate
        for i in range(70):
            obs = ForensicObservation(
                timestamp=i * 0.033,
                gaze_angular_deviation=5.0 + np.random.normal(0, 1.0),
                gaze_screen_coords=(0.5, 0.5),
                pupil_diameter_mm=4.0,
                screen_brightness_level=0.8,
                facial_rgb_mean=(180.0, 140.0, 120.0),
                candidate_speaking=False,
                keyboard_typing_active=False,
            )
            engine.process(obs)
        
        assert engine.is_calibrated
        
        # Inject anomalous gaze while speaking → should be suppressed
        for i in range(70, 120):
            obs = ForensicObservation(
                timestamp=i * 0.033,
                gaze_angular_deviation=35.0,  # Clearly anomalous
                gaze_screen_coords=(0.1, 0.1),
                pupil_diameter_mm=4.0,
                screen_brightness_level=0.8,
                facial_rgb_mean=(180.0, 140.0, 120.0),
                candidate_speaking=True,  # SPEAKING → suppress
                keyboard_typing_active=False,
            )
            alert = engine.process(obs)
            assert alert is None  # Suppressed!
    
    def test_whitespace_fixation_with_typing(self):
        """Verify whitespace + typing = HIGH severity."""
        detector = WhitespaceFixationDetector(window_size_frames=80)
        
        alert_raised = None
        for i in range(90):
            obs = ForensicObservation(
                timestamp=i * 0.033,
                gaze_angular_deviation=12.0,
                gaze_screen_coords=(0.05, 0.50),  # Whitespace zone
                pupil_diameter_mm=4.0,
                screen_brightness_level=0.8,
                facial_rgb_mean=(180.0, 140.0, 120.0),
                candidate_speaking=False,
                keyboard_typing_active=True,  # TYPING while looking at margin
            )
            alert = detector.process(obs)
            if alert:
                alert_raised = alert
                break
        
        assert alert_raised is not None
        assert alert_raised.severity == "HIGH"
        assert alert_raised.alert_type == "WHITESPACE_FIXATION"
    
    def test_kinematic_liveness_spoof_detection(self):
        """Verify kinematic engine detects static photo."""
        engine = KinematicGazeLivenessEngine(challenge_duration_sec=10.0)
        
        # Simulate static photo: NO micro-tremor
        for i in range(250):
            obs = ForensicObservation(
                timestamp=i * 0.033,
                gaze_angular_deviation=0.0,
                gaze_screen_coords=(0.5, 0.5),  # Perfectly static
                pupil_diameter_mm=3.5,
                screen_brightness_level=0.5,
                facial_rgb_mean=(120.0, 110.0, 105.0),  # Static colors
                candidate_speaking=False,
                keyboard_typing_active=False,
            )
            alert = engine.process(obs)
        
        assert alert is not None
        assert alert.alert_type == "SPOOFING_ATTEMPT"
    
    def test_plr_liveness_pupil_constriction(self):
        """Verify PLR engine detects pupil constriction after brightness spike."""
        engine = PLRrPPGLivenessEngine(challenge_duration_sec=10.0)
        
        # Build buffer with brightness transition and pupil constriction
        for i in range(260):
            brightness = 0.3 if i < 100 else (0.9 if i < 150 else 0.3)
            pupil_mm = 4.0 if i < 100 else (3.0 if i < 150 else 4.0)  # Constriction!
            
            obs = ForensicObservation(
                timestamp=i * 0.033,
                gaze_angular_deviation=5.0,
                gaze_screen_coords=(0.5, 0.5),
                pupil_diameter_mm=pupil_mm,
                screen_brightness_level=brightness,
                facial_rgb_mean=(180.0, 140.0, 120.0),
                candidate_speaking=False,
                keyboard_typing_active=False,
            )
            alert = engine.process(obs)
        
        # Should pass (no alert) because PLR is detected
        assert alert is None or (alert.alert_type != "SPOOFING_ATTEMPT")
```

### 6.2 End-to-End Flow Test

```python
# backend-cv/tests/test_e2e_flow.py (NEW)

import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

class TestE2EFlow:
    
    def test_health_endpoint(self):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["service"] == "Aegis Interview Room"
        assert "agents" in data
    
    def test_register_login_flow(self):
        # Register
        register_resp = client.post("/api/v1/auth/register", json={
            "email": "test@example.com",
            "password": "SecurePass123!",
            "role": "CANDIDATE",
        })
        assert register_resp.status_code in (200, 409)  # 409 if already exists
        
        # Login
        login_resp = client.post("/api/v1/auth/login", json={
            "email": "test@example.com",
            "password": "SecurePass123!",
        })
        assert login_resp.status_code == 200
        tokens = login_resp.json()
        assert "access_token" in tokens
        assert "refresh_token" in tokens
    
    def test_integrity_report_requires_auth(self):
        resp = client.get("/api/v1/integrity/some-session-id")
        assert resp.status_code == 403  # No auth token
```

---

## PHASE 7 — NEW FEATURES & ADVANCED CAPABILITIES (Week 15-16)

### 7.1 Invitation-Based Session Start (N-1)

```python
# backend-cv/agents/protocol_engine.py — Replace hardcoded code

import secrets
import hashlib

class InvitationCodeGenerator:
    @staticmethod
    def generate() -> str:
        """Generate CSPRNG invitation code (32+ bytes)."""
        return secrets.token_hex(32)  # 64 hex chars = 256 bits
    
    @staticmethod
    def hash(code: str) -> str:
        """Return SHA-256 hash for storage."""
        return hashlib.sha256(code.encode()).hexdigest()
    
    @staticmethod
    def verify(code: str, stored_hash: str) -> bool:
        return InvitationCodeGenerator.hash(code) == stored_hash
```

### 7.2 Post-Interview PDF Report (N-4)

```python
# backend-cv/report_generator.py (NEW)

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import json

class IntegrityReportGenerator:
    @staticmethod
    def generate(session_data: dict) -> bytes:
        """Generate downloadable PDF with integrity report."""
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        
        # Header
        c.setFont("Helvetica-Bold", 18)
        c.drawString(50, 750, "Aegis Interview Integrity Report")
        c.setFont("Helvetica", 10)
        c.drawString(50, 730, f"Session: {session_data['session_id']}")
        
        # Score
        c.setFont("Helvetica-Bold", 14)
        c.drawString(50, 690, f"Integrity Score: {session_data['integrity_score']}%")
        
        # Risk Breakdown
        c.setFont("Helvetica", 11)
        y = 660
        for severity, count in session_data.get('risk_breakdown', {}).items():
            c.drawString(50, y, f"{severity}: {count} events")
            y -= 20
        
        # Timeline
        c.setFont("Helvetica-Bold", 12)
        c.drawString(50, y - 20, "Event Timeline:")
        
        # ... render events ...
        
        c.save()
        return buf.getvalue()
```

### 7.3 ML Training Pipeline for Fraud Detection (N-8)

```python
# ml_pipeline/train.py (NEW DIRECTORY — ml_pipeline/)

"""
ML Training Pipeline for Fraud Detection.
Collects labeled risk events → trains anomaly detection model.

Steps:
1. Export labeled events from PostgreSQL
2. Feature engineering: event frequency, severity ratios, per-channel scores
3. Train isolation forest / autoencoder
4. Export model for inference
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
import joblib

class FraudDetectionModel:
    def __init__(self):
        self.model = IsolationForest(
            n_estimators=100,
            contamination=0.1,
            random_state=42,
        )
        
    def train(self, labeled_events_path: str):
        df = pd.read_csv(labeled_events_path)
        
        features = [
            "events_per_minute",
            "high_severity_ratio",
            "gaze_anomaly_rate",
            "hand_anomaly_rate",
            "audio_anomaly_rate",
            "keystroke_variance",
            "response_latency_mean",
            "tab_switch_count",
        ]
        
        X = df[features].fillna(0)
        self.model.fit(X)
        
        # Save model
        joblib.dump(self.model, "models/fraud_detector.pkl")
        return self.model
    
    def predict(self, features: np.ndarray) -> float:
        """Return anomaly score (-1 to 1). -1 = anomaly."""
        return self.model.score_samples(features.reshape(1, -1))[0]
```

---

## PHASE 8 — INFRASTRUCTURE & DEVOPS (Week 17-18)

### 8.1 Docker Compose with Health Checks

```yaml
# docker-compose.yml (ENHANCED)

version: '3.8'

services:
  backend:
    build:
      context: ./backend-cv
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://aegis:aegis@db:5432/aegis
      - JWT_SECRET=${JWT_SECRET}
      - REDIS_URL=redis://redis:6379/0
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - SKIP_AUTH=0
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
  
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "5173:80"
    depends_on:
      - backend
  
  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=aegis
      - POSTGRES_PASSWORD=aegis
      - POSTGRES_DB=aegis
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aegis"]
      interval: 10s
      timeout: 5s
      retries: 5
  
  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

### 8.2 CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: Aegis CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Python 3.12
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Install dependencies
        run: cd backend-cv && pip install -r requirements.txt
      - name: Run Ruff linting
        run: cd backend-cv && ruff check .
      - name: Run tests
        run: cd backend-cv && python -m pytest -v
      - name: Run security audit
        run: cd backend-cv && pip-audit
  
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Install dependencies
        run: cd frontend && npm ci
      - name: Run lint
        run: cd frontend && npm run lint
      - name: Run typecheck
        run: cd frontend && npm run typecheck
      - name: Run tests
        run: cd frontend && npm test
      - name: Build
        run: cd frontend && npm run build
```

---

## PHASE 9 — PERFORMANCE OPTIMIZATION (Week 19-20)

### 9.1 MediaPipe Instance Pool Optimization

**Current:** Fixed pool size `max(1, cpu_count())` — doesn't account for concurrent sessions.

```python
# main.py — Dynamic pool sizing
import psutil

def get_optimal_pool_size():
    cpu_count = os.cpu_count() or 2
    memory_gb = psutil.virtual_memory().total / (1024**3)
    
    # Each MediaPipe instance uses ~200MB RAM
    max_by_memory = int(memory_gb / 0.4)  # 400MB per instance with headroom
    max_by_cpu = cpu_count * 2  # 2x CPU oversubscription
    
    return max(2, min(max_by_memory, max_by_cpu, 16))  # Cap at 16
```

### 9.2 Frame Processing Pipeline — Skip Logic

**Current:** Every frame is processed. At 30fps, this is CPU-bound.

```python
# main.py — Frame skipping for non-critical frames

class FrameSkipper:
    def __init__(self, target_fps: int = 10):
        self.target_fps = target_fps
        self._last_process_time = 0.0
        self._frame_count = 0
        
    def should_process(self) -> bool:
        """Skip frames to maintain target FPS."""
        self._frame_count += 1
        now = time.time()
        if now - self._last_process_time < 1.0 / self.target_fps:
            return False
        self._last_process_time = now
        return True

# Usage in ws_cv loop:
frame_skipper = FrameSkipper(target_fps=10)

while True:
    raw = await websocket.receive_text()
    if not frame_skipper.should_process():
        continue  # Skip inference, still send heartbeat
    result = await infer_async(raw, ...)
```

---

## EXECUTION ROADMAP & PRIORITY MATRIX

| Phase | Category | Priority | Timeline | Key Deliverables |
|-------|----------|----------|----------|-----------------|
| **0** | Foundational Fixes | **CRITICAL** | Week 1-2 | 20 security + runtime fixes |
| **1** | Kinematic & Biometric | **CRITICAL** | Week 3-4 | PLR restore, Kalman optimization |
| **2** | Agent Orchestration | **HIGH** | Week 5-6 | Parallel dispatch, circuit breaker |
| **3** | Fusion Engine | **HIGH** | Week 7-8 | Windowed fusion, unified scoring |
| **4** | Frontend Architecture | **HIGH** | Week 9-10 | WS reconnection, reactive store |
| **5** | Security Hardening | **MEDIUM** | Week 11-12 | Redis, Prometheus, token rotation |
| **6** | Code Quality & Testing | **MEDIUM** | Week 13-14 | Integration tests, E2E flow |
| **7** | New Features | **LOW** | Week 15-16 | Invitations, PDF reports, ML |
| **8** | Infrastructure | **LOW** | Week 17-18 | Docker, CI/CD |
| **9** | Performance | **LOW** | Week 19-20 | Pool sizing, frame skipping |

### Critical Path (Must-Fix Before Any Feature Work)

1. **S-1 through S-10** — Security vulnerabilities → 0 tolerance
2. **R-1 through R-10** — Runtime bugs → functional correctness
3. **L-1 through L-10** — Liveness rewrite → integrity of biometric system
4. **B-1 through B-17** — Backend pipeline → system reliability
5. **F-1 through F-14** — Frontend bugs → UX correctness

### Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| KS-test false positive rate | ~25% | < 5% | Per-session KS alert count |
| PLR liveness pass rate (live) | 0% (broken) | > 95% | v4_liveness.passed metric |
| WS reconnection success | 0 (no retry) | > 99% | Connection uptime |
| Agent circuit breaker uptime | N/A | > 99.9% | Hub agent availability |
| Integrity score consistency | 3 divergent formulas | 1 source | Cross-module comparison |
| Extension detection latency | 2s scan interval | < 500ms | DOM scan timer |
| Security test coverage | 0 critical tests | 100% coverage | pytest security suite |
| Integration test coverage | 5 tests | 30+ tests | pytest coverage report |

---

## APPENDIX A: FILE CHANGE INVENTORY

| File | Phase | Change Type | Description |
|------|-------|-------------|-------------|
| `backend-cv/main.py` | 0, 1 | MODIFY | WebSocket auth fixes, Kalman optimization, frame skipper |
| `backend-cv/agents/hub.py` | 1, 2, 3 | MODIFY | Parallel dispatch, circuit breaker, KS fix |
| `backend-cv/agents/forensic_engine.py` | 1 | MODIFY | Kinematic hardening, PLR fix |
| `backend-cv/agents/fusion_engine.py` | 3 | REWRITE | Windowed fusion, proper decision matrix |
| `backend-cv/agents/fraud_agent.py` | 2 | MODIFY | Session duration normalization |
| `backend-cv/agents/utils.py` | 3 | MODIFY | Unified integrity score |
| `backend-cv/agents/circuit_breaker.py` | 2 | CREATE | Circuit breaker pattern |
| `backend-cv/cache.py` | 5 | MODIFY | Redis TLS, password enforcement |
| `backend-cv/monitoring.py` | 5 | MODIFY | Cardinality control |
| `backend-cv/auth.py` | 5 | VERIFY | Token rotation validation |
| `backend-cv/report_generator.py` | 7 | CREATE | PDF report generator |
| `backend-cv/tests/test_advanced_forensic.py` | 6 | CREATE | Integration tests |
| `backend-cv/tests/test_e2e_flow.py` | 6 | CREATE | E2E tests |
| `frontend/src/useWebSocket.js` | 4 | REWRITE | Exponential backoff, queue fix |
| `frontend/src/useAegisStore.js` | 4 | MODIFY | Reactive selectors |
| `frontend/src/LivenessChallenge.jsx` | 1, 4 | MODIFY | PlrChallenge integration, gaze validation |
| `frontend/src/InterviewArena.jsx` | 4 | MODIFY | v4_liveness alert handling |
| `frontend/src/useDigitalSecurity.js` | 4 | MODIFY | CSS injection scan |
| `frontend/src/useResponseTiming.js` | 4 | MODIFY | Event name fix |
| `docker-compose.yml` | 8 | MODIFY | Health checks, Redis auth |
| `.github/workflows/ci.yml` | 8 | CREATE | CI/CD pipeline |
| `ml_pipeline/train.py` | 7 | CREATE | ML training pipeline |

---

## APPENDIX B: RESEARCH PAPER INTEGRATION POINTS

*Ready for mapping research papers to specific components:*

| Research Area | Target Component | Integration Point |
|---------------|-----------------|-------------------|
| Gaze Entropy Analysis | `useGazeEntropy.js` | Horizontal scan detection |
| Response Timing | `useResponseTiming.js` | AI tool latency signatures |
| LLM Phraseology | `useLlmPhraseDetector.js` | 20+ forensic signals |
| Audio Forensics | `useAudioForensics.js` | Speaker verification |
| Deepfake Detection | `ChallengeResponseDeepfake.jsx` | Moving dot validation |
| Kinematic Liveness | `KinematicGazeLivenessEngine` | Head micro-tremor |
| Zero-Bypass Security | `useDigitalSecurity.js` | 10-vector shield |
| Five-Channel Fusion | `FiveChannelFusionEngine` | N≥3 decision matrix |
| Protocol Enforcement | `Protocol12LayerEngine` | 12-layer verification |
| Continuous Verification | `ContinuousVerifier` | Periodic re-challenge |
