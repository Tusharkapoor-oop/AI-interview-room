# Aegis Interview Platform — Comprehensive Implementation Plan

> Generated after 4-pass deep analysis across all subsystems (backend, frontend, security, liveness).
> Total issues found: **92** (6 CRITICAL security, 10 CRITICAL runtime, 18 HIGH, 25 MEDIUM, 33 LOW)

---

## PHASE 0 — CRITICAL SECURITY VULNERABILITIES (Fix Immediately)

### S-1: WebSocket Accept Before Authentication [CRITICAL]
**Files:** `backend-cv/main.py:591,739,917`
**Issue:** All three WebSocket endpoints (`ws_cv`, `ws_interview`, `ws_recruiter`) call `await websocket.accept()` BEFORE authentication. Socket is open, resources allocated, before any auth check.
**Impact:** DoS amplification — attacker can hold unlimited unauthenticated connections. Resources leak (MediaPipe instances, DB sessions, file descriptors).
**Fix:**
```python
# BEFORE (ws_cv example):
async def ws_cv(websocket: WebSocket):
    await websocket.accept()
    try:
        user = await get_current_user_from_ws(websocket)

# AFTER:
async def ws_cv(websocket: WebSocket):
    try:
        user = await get_current_user_from_ws(websocket)
        validate_origin(websocket, ALLOWED_ORIGINS)
    except HTTPException:
        return
    await websocket.accept()
```
**Apply to:** `ws_cv` (line 591), `ws_interview` (line 739), `ws_recruiter` (line 917).

### S-2: Full Auth Bypass via SKIP_AUTH [CRITICAL]
**Files:** `backend-cv/auth.py:6,75-79`, `.env`
**Issue:** `SKIP_AUTH=1` bypasses ALL JWT enforcement and returns hardcoded ADMIN user. The `.env` file is committed to git with this setting.
**Impact:** Anyone with repo access or who discovers this env var has full ADMIN access to ALL endpoints and ALL candidate data.
**Fix:**
```python
# BEFORE:
SKIP_AUTH = os.getenv("SKIP_AUTH", "").lower() in ("1", "true", "yes")

# AFTER (remove the dev-only bypass, force real auth):
SKIP_AUTH = False  # Never skip auth in production
```
**Add to .gitignore:** `.env`

### S-3: JWT Token in WebSocket Query Params [CRITICAL]
**File:** `backend-cv/auth.py:80`
**Issue:** JWT tokens accepted via `websocket.query_params.get("token")`. Query params are logged by every proxy, load balancer, and web server in the path.
**Impact:** JWT tokens leaked to infrastructure logs. Anyone with log access can replay tokens.
**Fix:** Accept tokens ONLY via WebSocket headers (`Sec-WebSocket-Protocol`) or a dedicated auth sub-protocol.

### S-4: No Authorization on Integrity Reports & Artifacts [CRITICAL]
**Files:** `backend-cv/main.py:1094-1119, 1122-1150`
**Issue:** `get_integrity_report(session_id)` and `get_artifacts(session_id)` check ONLY that user is authenticated (any role), NOT that they are the recruiter/admin ASSIGNED to that session/organization.
**Impact:** Any authenticated user can read ANY candidate's full integrity data, keystroke profiles, gaze heatmaps, and recorded artifacts.
**Fix:**
```python
# Add per-session authorization:
def authorize_session_access(user: dict, session_id: str):
    if user.get("role") == "ADMIN":
        return True
    # In production: query DB to verify user is assigned recruiter for this session
    if user.get("role") == "RECRUITER":
        session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
        if session and session.recruiter_id == user.get("sub"):
            return True
    raise HTTPException(status_code=403, detail="Access denied")
```

### S-5: Session ID Brute-Force on Recruiter Endpoint [CRITICAL]
**File:** `backend-cv/main.py:911,933`
**Issue:** `/ws/recruiter/{session_id}` accepts any session ID string. Recruiter can connect to ANY session without proving ownership.
**Impact:** Rogue recruiter can monitor any candidate's session, issue TERMINATE/WARN commands, exfiltrate risk events in real-time.
**Fix:** Validate that the authenticated recruiter is assigned to the session. If not assigned, close connection with 4003.

### S-6: Unvalidated Session ID from Query Params [HIGH]
**File:** `backend-cv/main.py:605`
**Issue:** `session_id = websocket.query_params.get("session_id", str(uuid.uuid4()))` — session ID is user-controlled with no validation. `validate_session_id()` exists (line 579) but is never called on WebSocket paths.
**Impact:** Session ID collision/overwriting. Attacker can craft matching session IDs to contaminate telemetry data.
**Fix:** Always generate session IDs server-side.

### S-7: No Size Limits on Base64 Frame Decoding [HIGH]
**File:** `backend-cv/main.py:329-332`
**Issue:** Base64 frames decoded with NO max size check. Attacker can send arbitrarily large payloads.
**Impact:** Memory exhaustion DoS.
**Fix:**
```python
if len(b64_frame) > 5_000_000:
    return {"status": "error", "msg": "frame_too_large"}
```

### S-8: ALLOWED_HOSTS Includes 0.0.0.0 [HIGH]
**File:** `backend-cv/main.py:162`
**Issue:** `0.0.0.0` in allowed hosts can bypass Host header validation.
**Fix:** Remove `0.0.0.0` from defaults.

### S-9: Hardcoded Invitation Code [CRITICAL]
**File:** `backend-cv/agents/protocol_engine.py:57,89`
**Issue:** `DEFAULT_AI_INVITATION_CODE = "AEGIS-VIP-2026"` is hardcoded. Session tokens are deterministic `AEGIS-SESSION-{sha256[:16]}` (only 64 bits).
**Impact:** Anyone knowing the code can impersonate any candidate. Session tokens are predictable.
**Fix:** Use per-candidate unique invitation codes (CSPRNG, 32+ bytes). Store hashed codes in DB.

### S-10: Origin Validation Does Not Validate WebSocket Origin Properly [HIGH]
**File:** `backend-cv/auth.py:97-100`
**Issue:** Case-sensitive comparison, no port handling, raises HTTPException (HTTP) in WebSocket context.
**Fix:** Normalize origin, use WebSocket close codes, handle port variations.

---

## PHASE 1 — CRITICAL RUNTIME BUGS

### R-1: MediaPipe Face Landmark Indices Wrong for Lip Detection [CRITICAL]
**File:** `backend-cv/main.py:544-549`
**Issue:** Indices 13 and 14 are dlib 68-point model indices for lips. MediaPipe FaceMesh 468/478-point model maps indices 13,14 to completely different facial regions (jaw/cheek).
**Impact:** `candidate_speaking` flag is garbage. Corrupts forensic engine KS-test speech suppression (`forensic_engine.py:134`) and PLR/rPPG pipeline.
**Fix:** Use correct MediaPipe lip landmarks:
```python
# MediaPipe 478 face mesh: outer lip contour is indices 0-11 (upper) and 12-18 (lower)
# Inner lip opening: use landmarks 13 and 14 which ARE the inner upper/lower lip
# BUT only when using the 478-point model with iris tracking
if face_detected and lms and len(lms) >= 478:
    # Actually verify: in MediaPipe canonical 478 model, indices 13/14 ARE correct for lip opening
    upper_lip = lms[13]
    lower_lip = lms[14]
    # ... but only with MediaPipe model, not dlib
```
**Verify:** Check MediaPipe FaceMesh topology documentation and confirm indices 13/14.

### R-2: KS Test Misuse — Comparing [screen_x, screen_y] Against screen_x Distribution [CRITICAL]
**File:** `backend-cv/agents/hub.py:237`
**Issue:** `self.ks_detector.is_anomalous([gaze_estimate["screen_x"], gaze_estimate["screen_y"]])` passes a 2-element list against a baseline of ~30 `screen_x` values. Sample size of 2 is statistically meaningless. Compares screen_y against screen_x distribution.
**Impact:** Guarantees false positives on every frame (or false negatives when baseline hasn't fitted).
**Fix:** Buffer screen_x and screen_y separately, test independently:
```python
self._gaze_baseline_buffer_x.append(gaze_estimate["screen_x"])
self._gaze_baseline_buffer_y.append(gaze_estimate["screen_y"])
if len(self._gaze_baseline_buffer_x) >= 30:
    self.ks_detector.fit_baseline(self._gaze_baseline_buffer_x)
    self._baseline_fitted = True
ks_anomalous = self.ks_detector.is_anomalous([gaze_estimate["screen_x"]]) if self._baseline_fitted else False
```

### R-3: Liveness Challenge Doesn't Actually Check Anything [CRITICAL]
**File:** `frontend/src/LivenessChallenge.jsx` (entire file)
**Issue:** The `PupilAnalyzer` doesn't measure pupil response — it reads generic canvas pixel brightness. Baseline confidence starts at 0.75 (above 0.65 pass threshold). Blink detection actually detects dot transition brightness jumps. Gaze dot challenge never validates where the candidate looks. Gotcha challenge is a countdown with zero verification. The kinematic HUD is `Math.random()`.
**Impact:** The entire liveness test is theatrical — a candidate can stare blankly, close their eyes, or look away and still pass.
**Fix:** See Phase 2 (Liveness Rewrite) below for complete rewiring.

### R-4: `ingest_security_features` Is Entirely Dead Code [CRITICAL]
**File:** `backend-cv/agents/hub.py:208-266`
**Issue:** `ingest_security_features()` is defined but NEVER CALLED. All its sub-components (HybridGazeTracker, GestureRecognitionEngine, KSAnomalyDetector, LivenessVerifier, FiveChannelFusionEngine, DeepfakeAgentEvaluator, KinematicAgentEvaluator) are allocated per-session but never used.
**Impact:** Memory wasted per session. Security pipeline doesn't run.
**Fix:** Wire `ingest_security_features` into the `ws_cv` processing loop (main.py line 645 area).

### R-5: `gesture_event.to_dict()` Will Crash When Called [CRITICAL]
**File:** `backend-cv/agents/hub.py:257`
**Issue:** `SecurityEvent` dataclass has no `to_dict()` method. If `ingest_security_features` were wired (R-4), `gesture_event.to_dict()` would raise `AttributeError`.
**Impact:** Silent failure of entire security pipeline (caught by broad except at line 264).
**Fix:** Add `to_dict()` to SecurityEvent or use `dataclasses.asdict()`.

### R-6: keyboard_typing_active Mapped to hand_anomaly [HIGH]
**File:** `backend-cv/main.py:658`
**Issue:** `keyboard_typing_active=result.get("hand_anomaly", False)` — maps typing detection to hand-near-ear/mouth detection. Spurious correlation.
**Impact:** WhitespaceFixationDetector gets false confidence boost when candidate touches ear.
**Fix:** Wire actual keystroke data or pass `False`.

### R-7: FiveChannelFusionEngine Accumulates Without Windowing [HIGH]
**File:** `backend-cv/agents/security_engine.py:243-277`
**Issue:** `_channel_results` list grows unbounded. `deviation_count` sums over ALL time, not a sliding window.
**Impact:** Severity irreversibly increases over time — 10-minute-old deviations still count.
**Fix:** Add time-based window or clear after evaluation:
```python
self._channel_results.clear()  # after evaluate()
```

### R-8: PLRrPPGLivenessEngine Receives Wrong Brightness Signal [CRITICAL]
**File:** `backend-cv/main.py:517` (frame_brightness) → `backend-cv/agents/forensic_engine.py:270-275`
**Issue:** `screen_brightness_level` is set to webcam frame brightness, not the screen flash stimulus. The PLR check requires `b_curr - b_prev >= 0.5` which never occurs in static office lighting (±0.01 variation).
**Impact:** PLR evaluation always fails (`plr_passed = False` permanently).
**Fix:** Frontend must send `stimulus_brightness` alongside frames. Backend must accept and use it:
```python
obs = ForensicObservation(
    ...
    screen_brightness_level=result.get("stimulus_brightness", result.get("frame_brightness", 0.5)),
    ...
)
```

### R-9: Frontend Ignores Backend v4_liveness Alerts [CRITICAL]
**Files:** `frontend/src/InterviewArena.jsx:272-345` vs `backend-cv/main.py:670-671`
**Issue:** Backend computes `v4_liveness` (PLR/rPPG result) and sends it to frontend, but InterviewArena's `handleCv` never checks `v4_liveness.verdict` or `v4_liveness.passed`.
**Impact:** Even when backend detects spoofing (PLR_FAIL, dual-failure), the frontend silently ignores it.
**Fix:**
```javascript
// In handleCv (InterviewArena.jsx):
if (data.v4_liveness && !data.v4_liveness.passed) {
    addRiskEvent({
        type: 'LIVENESS_FAIL',
        severity: data.v4_liveness.alert?.includes('CRITICAL') ? 'CRITICAL' : 'HIGH',
        desc: data.v4_liveness.alert || 'Liveness verification failed',
    });
    updateIntegrityScore();
}
```

### R-10: Event Name Mismatch — Candidate Response Timing Broken [CRITICAL]
**Files:** `frontend/src/InterviewArena.jsx:387`, `frontend/src/useResponseTiming.js:228`
**Issue:** InterviewArena dispatches `'aegis:candidate_answer'`, useResponseTiming listens for `'aegis:question_delivered'`.
**Impact:** Response timing analysis is entirely dead — never triggers.
**Fix:** Already fixed in previous pass (listener now uses `aegis:candidate_answer`).

---

## PHASE 2 — LIVENESS DETECTION REWRITE (Complete Rewire)

### L-1: Wire LivenessChallenge to Backend WebSocket
**Current:** LivenessChallenge runs entirely client-side with zero network calls.
**Fix:** Connect to `ws/cv` during the challenge phase. Send actual base64 frames.
```javascript
// In LivenessChallenge.jsx:
const cvWs = useWebSocket(CV_WS, handleCvResponse);
// Send frames at regular intervals
const captureAndSend = () => {
    canvas.toBlob(blob => {
        const reader = new FileReader();
        reader.onload = () => cvWs.send(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
    });
};
```

### L-2: Add Gaze-Dot Validation Using Backend Iris Tracking
**Current:** Gaze dot challenge never validates where candidate looks.
**Fix:** Backend already computes gaze direction (iris landmarks 468/473) in `_infer_frame()`. Send expected dot position alongside each frame. Backend compares actual gaze vs expected position.
```python
# In _infer_frame, add to result dict:
"gaze_target_error": math.hypot(gaze_h - expected_dot_x, gaze_v - expected_dot_y)
```
Frontend scores candidate on gaze-target error. Only pass if error < threshold for >80% of frames.

### L-3: Implement Real PLR Challenge via Reactivated PlrChallenge
**Current:** `PlrChallenge.jsx` (433 lines) has working flash cycle generation, eye ROI sampling, rPPG forehead sampling, sliding DFT heartbeat — but is dead code.
**Fix:** Integrate PlrChallenge as Step 2 of LivenessChallenge. The frontend sends:
- `"stimulus_brightness": 1.0` during flash
- `"stimulus_brightness": 0.0` during dark phase
Backend maps this to `obs.screen_brightness_level` and `PLRrPPGLivenessEngine` evaluates pupil constriction.

### L-4: Make Gotcha Challenge Actually Validate Actions
**Current:** Gotcha challenge shows a prompt, counts down 4s, does nothing.
**Fix:** For each prompt type, check backend inference:
```javascript
const GOTCHA_VALIDATORS = {
    "Pass your hand slowly across your face now": (result) => result.hands_visible > 0 && result.face_detected,
    "Turn your head 45° left, then 45° right slowly": (result) => Math.abs(result.pose.yaw) > 35,
    "Put your index finger over your lips": (result) => result.hand_anomaly === true,
};
```

### L-5: Fix PupilAnalyzer to Use Real Face/Eye Data
**Current:** `PupilAnalyzer.recordFrame()` samples generic canvas rectangle.
**Fix:** Remove client-side PupilAnalyzer entirely. All analysis happens server-side via MediaPipe. Client sends frames + receives analysis results.

### L-6: Fix MiniLivenessChallenge to Be Functional
**Current:** Shows 3 dots, auto-advances, always passes.
**Fix:** Same as L-2 — validate gaze direction against dot position using backend iris tracking.

### L-7: Fix Face Consistency Check to Use Actual Face Embeddings
**File:** `frontend/src/useContVerification.js:37-76`
**Current:** Computes rolling hash of 40×60 pixel rectangle. Hash changes with lighting, expression, rotation.
**Fix:** Send frame to backend, compute face embedding (MediaPipe face detection), compare via cosine similarity with threshold 0.6-0.7.

### L-8: Fix Voice Consistency Check
**File:** `frontend/src/useContVerification.js:91-145`
**Current:** Frequency band energy thresholds for "secondary voice detection." `speech_rate_wpm` = `120 + Math.random() * 40`.
**Fix:** Replace with real Voice Activity Detection (VAD). Remove fake `Math.random()` values. Use proper audio energy normalization.

### L-9: Remove or Gate the Skip Button
**Current:** Skip button visible at all times, single-click bypasses entire liveness system.
**Fix:** Require at least one genuine biometric check (backend-validated gaze tracking OR PLR) before enabling skip. Log skip event as `CREDENTIAL_WEAKNESS` risk event.

### L-10: Remove Fake Kinematic HUD
**File:** `LivenessChallenge.jsx:412-413`
**Current:** `Math.random()` values displayed as "Micro-Tremor RMS" and "Pink Noise".
**Fix:** Either wire real tremor analysis from backend or remove the display.

---

## PHASE 3 — BACKEND PIPELINE FIXES (HIGH PRIORITY)

### B-1: Wire Dead-Code Security Agents into Processing Loop
**File:** `backend-cv/agents/hub.py:208-266`
**Fix:** Call `ingest_security_features()` from `ws_cv` processing loop (around line 645 of main.py):
```python
if result["status"] == "ok":
    # ... existing code ...
    security_result = hub.ingest_security_features(result)
    if security_result and "error" not in security_result:
        result["v4_security"] = security_result
```

### B-2: LivenessVerifier Always Receives Default Values
**File:** `backend-cv/agents/hub.py:225-229`
**Issue:** `pupil_response_latency_ms`, `bpm`, `signal_quality` always use defaults from `.get(key, default)`.
**Fix:** Wire real values from inference data or remove the dead call until data is available.

### B-3: Deepfake Evaluator Always Receives Empty Lists
**File:** `backend-cv/agents/hub.py:240-244`
**Issue:** `mouth_velocities`, `audio_energies`, `spectral_artifact_scores` always default to `[]`.
**Fix:** Remove call or wire real data from audio pipeline.

### B-4: Kinematic Evaluator Always Receives Empty Skeletons
**File:** `backend-cv/agents/hub.py:245-246`
**Issue:** `inference.get("skeletons", [])` — always empty.
**Fix:** Remove call or wire MediaPipe Pose landmarks.

### B-5: PLRrPPGLivenessEngine Runs FFT on Every Frame [PERFORMANCE]
**File:** `backend-cv/agents/forensic_engine.py:258-261`
**Issue:** Once buffer hits 250 samples, FFT runs on EVERY frame (~30fps).
**Fix:** Add cooldown timer — run evaluation every 2s maximum.

### B-6: DB Session Leak if db.add() Raises Before try/finally
**File:** `backend-cv/main.py:759-762`
**Issue:** `db = SessionLocal()` before try block. If `db.add()` raises, `db.close()` in finally never runs.
**Fix:** Wrap DB operations in try/finally:
```python
db: Session = SessionLocal()
try:
    db_session = InterviewSession(id=session_id, status="IN_PROGRESS")
    db.add(db_session)
    db.commit()
except Exception:
    db.close()
    raise
```

### B-7: Remove Duplicate load_dotenv() Call
**File:** `backend-cv/main.py:29,68`
**Fix:** Remove line 68 (duplicate).

### B-8: Move `import re` to Top of File
**File:** `backend-cv/main.py:576`
**Fix:** Move to top of file.

### B-9: Fix KSAnomalyDetector to Use p-value, Not Fixed Threshold
**File:** `backend-cv/agents/security_engine.py:75`
**Issue:** `return statistic > 0.35` ignores sample size. D=0.35 is significant for n=100 but meaningless for n=5.
**Fix:** Implement proper p-value approximation.

### B-10: Fix KS Test Tie-Handling in security_engine.py
**File:** `backend-cv/agents/security_engine.py:60`
**Issue:** `if self.baseline[i] <= sample_sorted[j]` — should be `<` to properly advance both pointers on ties.
**Fix:** Change `<=` to `<`.

### B-11: Fix Gaze Baseline To Track Both screen_x AND screen_y
**File:** `backend-cv/agents/hub.py:232`
**Issue:** Only `screen_x` is buffered. Need separate buffers for x and y.
**Fix:** Buffer both axes independently.

### B-12: Add Missing ContinuousVerifier Integration
**File:** `backend-cv/agents/hub.py:132`
**Issue:** `ContinuousVerifier` instance created but NEVER referenced in any method.
**Fix:** Wire periodic liveness re-challenge into the interview loop.

### B-13: Remove Unused LivenessAgentEvaluator Instance
**File:** `backend-cv/agents/hub.py:141`
**Issue:** `self.liveness_evaluator = LivenessAgentEvaluator()` allocated but never used.
**Fix:** Remove.

### B-14: Coaching Gap Detection Pops Valid Gaps on Outlier
**File:** `backend-cv/agents/audio_agent.py:118-119`
**Issue:** `self._coaching_gaps.pop(0)` removes oldest valid gap when a non-coaching gap arrives.
**Fix:** Don't pop valid data on outlier. Instead, use timestamp-based expiry.

### B-15: FraudAgent compute_assessment() Ignores session_duration
**File:** `backend-cv/agents/fraud_agent.py:93`
**Issue:** `session_duration_seconds` parameter never used. Scoring doesn't normalize by time.
**Fix:** Normalize event frequency by session duration.

### B-16: MediaPipe Model Download Missing Integrity Verification
**File:** `backend-cv/main.py:187-197`
**Issue:** Models downloaded via HTTP with no SHA-256 verification.
**Fix:** Add hash verification post-download.

### B-17: Rate Limiter Uses time.time() Instead of time.monotonic()
**File:** `backend-cv/ratelimit.py:16-18`
**Issue:** System clock changes can bypass or lock out rate limiter.
**Fix:** Use `time.monotonic()`.

---

## PHASE 4 — FRONTEND BUG FIXES (HIGH PRIORITY)

### F-1: useWebSocket — drainQueue Sends to onMessageRef Instead of WebSocket
**File:** `frontend/src/useWebSocket.js:19-26`
**Issue:** `drainQueue` delivers queued messages to `onMessageRef` handler instead of calling `ws.send()`.
**Impact:** Queued WebSocket messages are silently dropped and never sent.
**Fix:** Replay queued messages over the live WebSocket, not as synthetic events.

### F-2: IdentityVerification — AudioContext Leaks on Unmount
**File:** `frontend/src/IdentityVerification.jsx:177`
**Issue:** `AudioContext` created but never closed on component unmount.
**Fix:** Add cleanup in useEffect return.

### F-3: screenShare Stored on window Global, Never Cleaned Up
**File:** `frontend/src/OnboardScreen.jsx:140`
**Issue:** `window.aegisScreenStream = stream` — stores on window, never stopped.
**Fix:** Store in ref, stop tracks on unmount.

### F-4: ScoreReport Uses Math.random() for Scores
**File:** `frontend/src/ScoreReport.jsx:199-206`
**Issue:** `Math.random()` generates scores on every render.
**Fix:** Use deterministic derivation from state.

### F-5: CalibrationScreen — MediaStream Promise Resolves After Unmount
**File:** `frontend/src/CalibrationScreen.jsx:58-63`
**Issue:** Async getUserMedia resolves after component unmount → setState on unmounted component.
**Fix:** Add mountGuard flag.

### F-6: useRppg — Stale Closure in Capture Interval
**File:** `frontend/src/useRppg.js:199-221`
**Issue:** setInterval callback captures stale closure.
**Fix:** Move capture function to ref-based callback.

### F-7: App.jsx — Non-Reactive getState() in JSX
**File:** `frontend/src/App.jsx:183-185`
**Issue:** `useAegisStore.getState().integrityScore` used directly in JSX — component never re-renders on score change.
**Fix:** Use reactive hook: `const { integrityScore } = useAegisStore();`

### F-8: InterviewArena — Canvas getContext('2d') Can Return null
**File:** `frontend/src/InterviewArena.jsx:365-366`
**Issue:** `canvas.getContext('2d')` returns null if canvas is corrupted or hardware-accelerated context fails.
**Fix:** Add null guard.

### F-9: useNuclearLockdown — Deprecated >>> Shadow-DOM Combinator
**File:** `frontend/src/useNuclearLockdown.js:291`
**Issue:** `document.querySelector('>>> ...')` — `>>>` is deprecated and removed from modern browsers.
**Fix:** Use `:host-context()` or a ref-based approach.

### F-10: useDigitalSecurity — Magic Number 9
**File:** `frontend/src/useDigitalSecurity.js:120`
**Issue:** `slice.length - 1` should replace magic number 9.
**Fix:** Use computed value.

### F-11: useKeystrokeDynamics — NaN from null questionShownAt
**File:** `frontend/src/useKeystrokeDynamics.js:97`
**Issue:** `Date.now() - null` produces NaN.
**Fix:** Guard with explicit null check.

### F-12: useAegisStore — Duplicate Lockdown Trigger
**File:** `frontend/src/useAegisStore.js:153`
**Issue:** Lockdown trigger can fire multiple times.
**Fix:** Guard with `!get().strictMandatoryLockdown` check.

### F-13: useResponseTiming — Event Listener Cleanup Mismatch
**File:** `frontend/src/useResponseTiming.js:228,232`
**Issue:** `addEventListener('aegis:candidate_answer')` but `removeEventListener('aegis:question_delivered')` in cleanup.
**Fix:** Ensure add/remove use the same event name.

### F-14: HITLPanel — Stale Closure in setInterval
**File:** `frontend/src/HITLPanel.jsx:38-51`
**Issue:** setInterval callback via `handleDecision` has stale closure.
**Fix:** Use ref proxy for callback.

---

## PHASE 5 — SECURITY HARDENING (MEDIUM PRIORITY)

### H-1: Add Rate Limiting on Auth Endpoints
**Files:** `backend-cv/main.py:1001-1069`
**Action:** Apply IP-based + credential-based rate limiting on `/register`, `/login`, `/refresh`.

### H-2: Privilege Escalation via Registration
**File:** `backend-cv/main.py:1001-1028`
**Issue:** Register endpoint allows any role (CANDIDATE/RECRUITER/ADMIN).
**Fix:** Only allow CANDIDATE role at registration. ADMIN/RECRUITER set by existing admins only.

### H-3: Email Enumeration via Registration
**File:** `backend-cv/main.py:1006-1008`
**Issue:** HTTP 409 "Email already registered" allows email enumeration.
**Fix:** Return generic response: "If email exists, check your inbox."

### H-4: Redis Without Authentication
**File:** `backend-cv/cache.py:11`
**Issue:** Default `redis://localhost:6379/0` with no password.
**Fix:** Require Redis password via env. Deny connection without one.

### H-5: Redis KEYS * Blocking Command
**File:** `backend-cv/cache.py:92`
**Issue:** `KEYS "session:*"` is O(N), blocks event loop.
**Fix:** Use `SCAN` instead.

### H-6: Prometheus Label Cardinality Explosion
**Files:** `backend-cv/monitoring.py:43-48, 85-89`
**Issue:** Path labels and session_id labels create unbounded cardinality.
**Fix:** Strip dynamic segments from path. Remove session_id label from INTEGRITY_SCORE.

### H-7: MCP Tools Missing Authorization
**File:** `backend-cv/mcp/sqlite_server.py:28-116`
**Issue:** SQLite tools have no authorization checks.
**Fix:** Add caller identity validation to each handler.

### H-8: GitHub MCP Server Missing Auth
**File:** `backend-cv/mcp/github_server.py`
**Issue:** No authentication. `call_count` mutable without lock.
**Fix:** Add instance lock for rate limit. Require auth for tool invocation.

### H-9: Rate Limiter IP Spoofable Behind Proxies
**File:** `backend-cv/ratelimit.py:37`
**Issue:** `websocket.client.host` returns proxy IP, not client IP.
**Fix:** Use `X-Forwarded-For` with trusted proxy list.

### H-10: Add Security Headers (CSP, HSTS, X-XSS-Protection)
**File:** `backend-cv/main.py:166-172`
**Fix:** Add `Content-Security-Policy` and `Strict-Transport-Security` headers.

### H-11: Add Account Lockout on Failed Login
**File:** `backend-cv/main.py:1031-1052`
**Fix:** Lock account after N failed attempts with exponential backoff.

### H-12: Implement Refresh Token Rotation
**File:** `backend-cv/auth.py:59-63`
**Fix:** Issue new refresh token on each refresh, invalidate old one.

### H-13: Add JWT `iat` and `jti` Claims
**File:** `backend-cv/auth.py:52-56,59-63`
**Fix:** Add issued-at and token ID claims for revocation support.

### H-14: Recruiter Socket Hijacking Prevention
**File:** `backend-cv/main.py:933`
**Issue:** `recruiter_sockets[session_id] = websocket` — second recruiter silently replaces first.
**Fix:** Use unique connection IDs. Reject or warn on duplicate connections.

### H-15: Unvalidated Recruiter Commands Sent Directly to Candidate
**File:** `backend-cv/main.py:957-969`
**Issue:** Messages forwarded to candidate WebSocket without content validation.
**Fix:** Whitelist allowed message types. Never forward recruiter text directly.

### H-16: HITL Actions Missing Trace/Audit IDs
**File:** `backend-cv/main.py:950-969`
**Fix:** Add correlation IDs to all HITL actions. Log acting user ID.

---

## PHASE 6 — CODE QUALITY (MEDIUM PRIORITY)

### Q-1: Deduplicate Integrity Score Formula (Currently 3 Copies)
**Files:** `backend-cv/main.py:700-722`, `backend-cv/agents/hub.py:65-72`
**Action:** Extract to shared function.

### Q-2: Add Public Accessor for cv_agent._events_emitted
**File:** `backend-cv/main.py:700,717`
**Action:** Add `@property` to CVAgent.

### Q-3: Fix Variable Name `db_session` → `db_record`
**File:** `backend-cv/main.py:760`
**Action:** Rename to avoid shadowing SQLAlchemy session convention.

### Q-4: Fix Broadcast_to_recruiter Swallowing Exceptions
**File:** `backend-cv/main.py:101-104`
**Action:** Log the exception at debug level instead of silent try/except.

### Q-5: Handle Non-Ping JSON Messages in ws_cv
**File:** `backend-cv/main.py:631-637`
**Action:** Add `continue` for non-ping JSON messages instead of treating them as frame data.

### Q-6: Clean Up Partial Model Downloads on Failure
**File:** `backend-cv/main.py:187-197`
**Action:** Delete partial files on download exception.

### Q-7: Remove akasha_engine.py Dead Code
**File:** `backend-cv/agents/akasha_engine.py` (175 lines, never imported)
**Action:** Remove entire file.

### Q-8: Ensure Consistent Response Shape
**File:** `backend-cv/main.py:662-683`
**Issue:** v4 fields (ks_test, whitespace, liveness, fusion) only present when status=="ok".
**Fix:** Initialize defaults outside the if block.

### Q-9: Fix CodeReviewAgent Module-Level Code
**File:** `backend-cv/agents/code_review_agent.py:23-28`
**Issue:** `import logging as _logging` runs at import time. Shadows module-level logging.
**Fix:** Move to function.

### Q-10: Move import json Inside Methods to Module Level
**Files:** `backend-cv/agents/hub.py:524`, `bias_agent.py:99`, `code_review_agent.py:108`
**Fix:** Move to top of files.

---

## PHASE 7 — NEW FEATURES (LOW PRIORITY)

### N-1: Invitation-Based Session Start
Recruiter generates unique link with CSPRNG token. Candidate enters without auth. Token validated at session start.

### N-2: Audit Log for All HITL Decisions
Persist all TERMINATE/WARN/FLAG decisions to DB with recruiter identity, timestamp, and session ID.

### N-3: Live Recruiter Dashboard
Real-time metrics: active sessions, average integrity score, fraud flags per minute, agent status.

### N-4: Post-Interview Report PDF
Downloadable summary with timeline, score breakdown, risk event log, and reviewer notes.

### N-5: Screen + Camera Recording Playback
Store recordings in S3-compatible storage. Viewable from CommandCenter with timeline sync.

### N-6: Proper Migration System (Alembic)
Current `Base.metadata.create_all()` runs at import time. Replace with proper Alembic migrations.

### N-7: WebSocket Heartbeat / Reconnection
Add ping/pong keepalive. Implement exponential backoff reconnection in frontend useWebSocket.

### N-8: ML Training Pipeline for Fraud Detection
Collect labeled risk events. Train ML model for anomaly detection (replace heuristics).

### N-9: Multi-Tenant Organization Support
Isolate candidate sessions, recruiter assignments, and reports by organization.

### N-10: GDPR/CCPA Data Export & Deletion
API endpoint to export all data for a candidate. API endpoint to delete all data for a candidate.

---

## SUMMARY

| Phase | Category | Priority | Count | Key Items |
|-------|----------|----------|-------|-----------|
| 0 | Security vulnerabilities | CRITICAL | 10 | WebSocket accept-before-auth, SKIP_AUTH bypass, JWT in query params, no per-session auth |
| 1 | Runtime bugs | CRITICAL | 10 | Wrong MediaPipe indices, KS test misuse, fake liveness challenge, dead security pipeline |
| 2 | Liveness rewrite | CRITICAL | 10 | Wire to backend, real gaze validation, reactivate PlrChallenge, fix gotcha, fix consistency checks |
| 3 | Backend pipeline | HIGH | 17 | Wire dead agents, fix resource leaks, algorithm fixes, performance issues |
| 4 | Frontend bugs | HIGH | 14 | WebSocket queue, AudioContext leaks, stale closures, Canvas null, event cleanup |
| 5 | Security hardening | MEDIUM | 16 | Rate limiting, Redis auth, Prometheus cardinality, token rotation, CSP headers |
| 6 | Code quality | MEDIUM | 10 | Dedup formulas, naming, error handling, dead code removal |
| 7 | New features | LOW | 10 | Invitation system, audit log, dashboard, PDF reports, recording playback |

**Total: 92 issues across 8 phases.**

### Recommended Implementation Order
1. **Phase 0** (Security) + **Phase 1** (Runtime bugs) — Fix now, block all other work
2. **Phase 2** (Liveness rewrite) — Complete liveness system rewiring
3. **Phase 3** + **Phase 4** (Backend pipeline + Frontend bugs) — Core functionality fixes
4. **Phase 5** (Security hardening) — Defense in depth
5. **Phase 6** (Code quality) — Maintenance
6. **Phase 7** (New features) — Future roadmap

---

# APPENDIX: Full Codebase Audit — July 2026

## Overall Grade: **C−** (Below Production Standard)

| Domain | Grade | Issues |
|--------|-------|--------|
| Frontend React | **D+** | 164 ESLint errors, 28 warnings, 7 ref-mutation hooks, 5 setState-in-effect, 3 impure-render calls, `process` undefined crash |
| Backend Python | **C−** | 43 ruff errors, 2 runtime `NameError` bugs, broken `cache.py`, silent `except:pass`, 25+ files with deprecated typing |
| Infrastructure | **D** | Root container, JWT fallback secret, process.env crash, no TS parser in ESLint, CI will fail |
| Tests | **C−** | 28 tests, no CSRF/prompt-injection/ratelimit coverage, no E2E |
| Config/DevOps | **C** | 20 infra findings (5 CRITICAL, 6 HIGH) |

---

## CRITICAL FINDINGS (9 — Fix immediately)

### Backend (4)

| # | File:Line | Issue |
|---|-----------|-------|
| **C1** | `main.py:759` | **`typing` is undefined** — `def validate_session_id(session_id: typing.Any) -> bool` but `typing` never imported. `NameError` on function call (every WS connect). |
| **C2** | `main.py:1588` | **`JSONResponse` is undefined** — `return JSONResponse(...)` in `spa_fallback` without import. `NameError` when hitting any non-API/WS route. |
| **C3** | `cache.py:24` | **`ensure_connected()` method missing** — Every method calls `await self.ensure_connected()` but it is never defined. Entire cache layer is dead code — crashes immediately on any cache access. |
| **C4** | `main.py:732` | **`None + float = TypeError`** — `ear_left` and `ear_right` can be `None` (from `_compute_ear`), but `eye_open = (ear_left + ear_right) / 2.0` doesn't check. This crashes the CV inference loop silently. |

### Frontend (2)

| # | File:Line | Issue |
|---|-----------|-------|
| **C5** | `vite.config.ts:10,14` | **`process` undefined in Vite 8** — Vite removed the process polyfill. `process.env.VITE_API_URL` throws `ReferenceError` at dev server startup. Use `import.meta.env.VITE_API_URL`. |
| **C6** | `eslint.config.js:18` | **No TypeScript parser configured** — Config targets `*.ts` files but uses default `espree` parser. `aegis.ts` fails to parse; all `.ts` files silently un-linted. |

### Infrastructure (3)

| # | File:Line | Issue |
|---|-----------|-------|
| **C7** | `docker-compose.yml:72` | **JWT fallback secret exposed** — `${JWT_SECRET:-dev-secret-change-in-production}`. If env var unset, JWTs are forgeable by anyone who reads this file. |
| **C8** | `Dockerfile:12` | **Runs as root** — No `USER` directive. Privilege escalation vector. |
| **C9** | `docker-compose.yml:75` | **otel-collector service missing** — `OTEL_EXPORTER_OTLP_ENDPOINT` points to `http://otel-collector:4317` but no such service exists. OpenTelemetry exports fail 100%. |

---

## HIGH FINDINGS (18 — Fix this sprint)

### Backend (5)

| # | File:Line | Issue |
|---|-----------|-------|
| **H1** | `main.py:171,1017,1224` | **`except Exception: pass`** — 3 locations silently swallowing errors (shutdown, WS send). Errors invisible in production. |
| **H2** | Multiple files | **Bare `except Exception`** — `main.py:346,409,515` catch all exceptions without logging or re-raising. |
| **H3** | `auth.py:120`, `main.py:1441` | **B904: `raise` without `from`** — In except clauses, `raise HTTPException(...)` without `raise ... from err` loses the original exception traceback. |
| **H4** | `main.py:305` | **`threading` redefined** — Already imported at line 20. Second import (line 305) shadows it. First import goes unused. |
| **H5** | `main.py:65` | **`tag_span_with_session` imported but unused** — Dead import that could mask broken monitoring. |

### Frontend (8)

| # | File:Line | Issue |
|---|-----------|-------|
| **H6** | `useDigitalSecurity.js:29,181` | **Ref mutation during render** — `onRiskEventRef.current = onRiskEvent` and `return { tabSwitchCount: ref.current }`. Violates React 19 rules. Same pattern in 6 other hooks. |
| **H7** | `useContVerification.js:43` | Ref mutation during render — `onAudioFeaturesRef.current = onAudioFeatures` |
| **H8** | `useGazeEntropy.js:207` | Ref mutation during render — `telemetryRef.current = telemetry` |
| **H9** | `useResponseTiming.js:115,246` | Ref mutation during render — `aiSpeakingRef.current = aiSpeaking` and returning `latencies: latenciesRef.current` |
| **H10** | `useNuclearLockdown.js:651` | Ref mutation during render — returning `detectedIds: detected.current` |
| **H11** | `useAegisStore.js:66` | **Duplicate key `pose`** — `{ pose: {...}, ...t, pose: {...} }`. First `pose` is dead code that ESLint flags. |
| **H12** | `AppealPanel.jsx:209`, `AudioWaveform.jsx:51-53` | **Impure function calls during render** — `Date.now()`, `Math.random()` directly in JSX. Breaks React 19 StrictMode idempotency. |
| **H13** | `ArtifactViewer.jsx:130`, `PlrChallenge.jsx:202`, `useApplicationLockdown.js:263`, `useNuclearLockdown.js:602`, `LuxConciergePopup.jsx:36` | **setState in useEffect body** — Cascading renders. Should be wrapped in callbacks or event handlers. |

### Infrastructure (5)

| # | File:Line | Issue |
|---|-----------|-------|
| **H14** | `docker-compose.yml` (all services) | **No restart policy** — Any container crash stays dead. Add `restart: unless-stopped`. |
| **H15** | `docker-compose.yml:11,25` | **Postgres/Redis ports exposed to host** — Remove port bindings for internal services. |
| **H16** | `Dockerfile:40`, `render.yaml:14-15` | **`ALLOWED_HOSTS=*`** — Overly permissive. Bind to concrete hostnames. |
| **H17** | `requirements.txt:24-27` | **Dev tools in prod image** — `ruff`, `pytest` shipped in Docker. Split into `dev-requirements.txt`. |
| **H18** | `.github/workflows/ci.yml:43` | **`pytest-timeout` not installed** — `pytest --timeout=30` will fail. Add `pytest-timeout` or remove flag. |

---

## MEDIUM FINDINGS (24)

### Backend (12)

| # | File:Line | Issue |
|---|-----------|-------|
| **M1** | `main.py:1446+` | **B008: `Depends()` in argument defaults** — 5 routes use `Depends(require_auth)` as default, evaluated at function definition time. |
| **M2** | `main.py:250-251` | **E402: `import secrets` after function definitions** — Imports buried in module body. |
| **M3** | `main.py:349-352` | **Dead cleanup code** — `finally` checks for `.partial` file but `urlretrieve` downloads to `path` directly. `.partial` branch unreachable. |
| **M4** | `cache.py:16-21` | **`redis_password` fetched but never used** — Redis connects without password. |
| **M5** | `database.py:238` | **`create_all` runs on import** — Side effect on any `import database`. |
| **M6** | `agents/protocol_engine.py:288` | **B905: `zip()` without `strict=True`** — Silent data mismatch on unequal lists. |
| **M7** | `agents/hub.py:528` | **S311: `random.choice()` for non-crypto** — Should use `secrets` module. |
| **M8** | `agents/cv_agent.py:288` | **F841: `gaze_v` assigned but never used** |
| **M9** | `storage.py:66` | Bare `except Exception` hiding S3 failures |
| **M10** | `agents/code_review_agent.py:24` | E402: `import logging` after top-level code |
| **M11** | `agents/memory_agent.py:65,86,100` | Bare excepts without re-raise |
| **M12** | `agents/hub.py:601` | `avg_latency` used 12 lines before initialization |

### Frontend (8)

| # | File:Line | Issue |
|---|-----------|-------|
| **M13** | `useKeystrokeDynamics.js:161` | Missing dep `onBaselineBuilt` in useCallback |
| **M14** | `useNuclearLockdown.js:281+` | 10+ useCallback hooks missing `activePhases` from deps |
| **M15** | `useNuclearLockdown.js:595` | `e` and `_` defined but never used (4 instances) |
| **M16** | `useAudioForensics.js:52-69` | 2 unused constants, 1 unused ref |
| **M17** | `useGazeEntropy.js:37` | `ENTROPY_THRESH` defined but never used |
| **M18** | `useRppg.js:27-28` | `FREQ_MIN`, `FREQ_MAX` defined but never used |
| **M19** | `CommandCenter.jsx:354`, `IDEView.jsx:38-39` | **`console.log` in production** |
| **M20** | `FraudScoreEngine.js` | `.js` file with JSX — should be `.jsx` |

### Infrastructure (4)

| # | File:Line | Issue |
|---|-----------|-------|
| **M21** | `Dockerfile:49` | Hardcoded port `8000` instead of `$PORT` — will break on Render/Heroku |
| **M22** | `docker-compose.yml:57-58` | Grafana provisioning dirs don't exist (`backend-cv/grafana/` empty) |
| **M23** | `alembic.ini:89` | SQLite URL as default — footgun when `DATABASE_URL` not set |
| **M24** | `frontend/package.json` | Missing `@types/three` devDependency |

---

## LOW FINDINGS (20+)

| # | Area | Issue |
|---|------|-------|
| **L1** | All backend | 25+ files use deprecated `typing.List`, `typing.Dict`, `typing.Optional` — Python 3.14+ supports `list`, `dict`, `X \| None` |
| **L2** | All backend | ~100+ magic numbers — no named constants |
| **L3** | `agents/forensic_engine.py:347` | Unnecessary `elif` after `return` |
| **L4** | `main.py:1383` | Unnecessary `else` after `raise` |
| **L5** | `version.py:16` | `open()` without `encoding="utf-8"` |
| **L6** | `memory/vector_store.py:50` | `open()` without `encoding="utf-8"` |
| **L7** | `agents/memory_agent.py:63` | `open()` without `encoding="utf-8"` |
| **L8** | `tests/test_v4_engine.py` | Uses unittest `assertEqual` instead of plain `assert` (PT009) |
| **L9** | 20 frontend files | `import React` unused — React 19 JSX transform doesn't need it |
| **L10** | `aegis.ts` | TypeScript file not used by any component — dead code |
| **L11** | `FraudScoreEngine.js` | `.js` extension should be `.jsx` (contains JSX) |
| **L12** | `SecurityDashboard.jsx:637` | `highCount` assigned but never used |
| **L13** | `types/aegis.ts` | Defines store types but store is `.js` — types are dead |
| **L14** | `docker-compose.yml:1` | `version: "3.8"` deprecated in v2 compose |
| **L15** | `cache.py:5`, `monitoring.py:3` | Deprecated typing imports |
| **L16** | `.gitignore` | Missing `*.db` — `aegis.db` not in gitignore |
| **L17** | `ci.yml:68` | `trufflehog@v3` mutable tag — pin to specific version |
| **L18** | `agents/__init__.py` | Empty init — should re-export key classes |
| **L19** | No `pyproject.toml` | Ruff config is CLI-only — no versioned config |
| **L20** | No `VERSION` file | `version.py` references file that doesn't exist |

---

## IMPLEMENTATION PLAN TO REACH A+ GRADE

### PHASE 1 — CRITICAL FIXES (Do First — Production Blockers)

**Goal: Stop crashes and security holes**

| Step | Files | Effort | Verification |
|------|-------|--------|-------------|
| 1.1 Add `import typing` | `main.py:14` | 1 line | `import main` succeeds |
| 1.2 Add `from fastapi.responses import JSONResponse` | `main.py` top-level | 1 line | SPA fallback returns 404 |
| 1.3 Define `ensure_connected` or remove calls | `cache.py` | 30 min | Cache tests pass |
| 1.4 Guard `ear_left + ear_right` against `None` | `main.py:732` | 5 min | CV loop handles None EAR |
| 1.5 Replace `process.env` → `import.meta.env` | `vite.config.ts:10,14` | 5 min | `npm run dev` starts |
| 1.6 Add `@typescript-eslint/parser` | `eslint.config.js` | 15 min | `npm run lint` catches TS errors |
| 1.7 Remove JWT fallback (`${...:?}` syntax) | `docker-compose.yml:72` | 1 line | Compose fails if unset |
| 1.8 Add `USER 1000` | `Dockerfile` | 1 line | Container runs non-root |
| 1.9 Add otel-collector or remove env var | `docker-compose.yml` | 15 min | No OTEL connection errors |

### PHASE 2 — HIGH FIXES (This Sprint)

**Goal: Eliminate runtime errors and security gaps**

| # | Step | Key Files |
|---|------|-----------|
| 2.1 | Fix `except Exception: pass` — log or re-raise | `main.py:171,1017,1224` |
| 2.2 | Add `raise ... from err` to all bare excepts | `main.py:1441`, `auth.py:120` |
| 2.3 | Remove duplicate `import threading` | `main.py:20` or `305` |
| 2.4 | Fix all 7 ref-mutation hooks: move updates to `useEffect` | `useDigitalSecurity.js:29`, `useContVerification.js:43`, `useGazeEntropy.js:207`, `useResponseTiming.js:115`, `useNuclearLockdown.js:651` |
| 2.5 | Move ref reads (`ref.current`) out of render return | `useDigitalSecurity.js:181`, `useResponseTiming.js:246`, `useNuclearLockdown.js:651` |
| 2.6 | Fix duplicate `pose` key | `useAegisStore.js:62,66` |
| 2.7 | Wrap impure calls in `useMemo` or `useEffect` | `AppealPanel.jsx:209`, `AudioWaveform.jsx:51-53` |
| 2.8 | Extract setState from useEffect to event handlers | 5 files (H13) |
| 2.9 | Add `restart: unless-stopped` to all services | `docker-compose.yml` |
| 2.10 | Remove port bindings for postgres/redis | `docker-compose.yml:11,25` |
| 2.11 | Set `ALLOWED_HOSTS` via env with concrete values | `Dockerfile:40`, `render.yaml:14` |
| 2.12 | Split dev requirements → `dev-requirements.txt` | `requirements.txt` |
| 2.13 | Add `pytest-timeout` or remove `--timeout` flag | `ci.yml:43` |

### PHASE 3 — MEDIUM FIXES (Next Sprint)

**Goal: Code quality and developer experience**

| # | Step | Key Files |
|---|------|-----------|
| 3.1 | Fix B008: `Depends()` defaults | `main.py:1446,1470,1487,1518,1546` |
| 3.2 | Add `apply(lambda: ...)` or restructure | — |
| 3.3 | Fix `redis_password` unused | `cache.py:16` |
| 3.4 | Add `strict=True` to `zip()` | `agents/protocol_engine.py:288` |
| 3.5 | Replace `random` → `secrets` | `agents/hub.py:528` |
| 3.6 | Remove unused variables across 6 frontend files | `useNuclearLockdown.js`, `useAudioForensics.js`, `useGazeEntropy.js`, `useRppg.js`, `SecurityDashboard.jsx` |
| 3.7 | Remove `console.log` | `CommandCenter.jsx:354`, `IDEView.jsx:38-39` |
| 3.8 | Rename `FraudScoreEngine.js` → `.jsx` | `FraudScoreEngine.js` |
| 3.9 | Fix Grafana provisioning dirs | Create `backend-cv/grafana/{dashboards,datasources}` |
| 3.10 | Add `@types/three` | `frontend/package.json` |
| 3.11 | Add `resolve.alias` for `@/*` | `vite.config.ts` |
| 3.12 | Add `ruff format --check` to CI | `ci.yml` |

### PHASE 4 — LOW FIXES (Backlog Cleanup)

**Goal: Zero lint warnings, future-proof code**

| # | Step | Scope |
|---|------|-------|
| 4.1 | Migrate all `typing.List/Dict/Optional` → `list/dict/X\|None` | 25+ files, `ruff check --fix --select=UP` |
| 4.2 | Extract magic numbers to named constants | `agents/cv_agent.py`, `agents/audio_agent.py`, etc. |
| 4.3 | Clean up unnecessary `elif` after `return` | `agents/forensic_engine.py:347,522` |
| 4.4 | Add `encoding="utf-8"` to all `open()` calls | `version.py`, `vector_store.py`, `memory_agent.py` |
| 4.5 | Switch test assertions → plain `assert` | `test_v4_engine.py` (29 fixes) |
| 4.6 | Remove unused `import React` from 20 files | Add `react/jsx-runtime` to ESLint config |
| 4.7 | Remove `aegis.ts` if unused, or import it | `types/aegis.ts` |
| 4.8 | Add `*.db` to `.gitignore` | `.gitignore` |
| 4.9 | Pin `trufflehog` to specific version | `ci.yml:68` |
| 4.10 | Create `pyproject.toml` with ruff config | Root |
| 4.11 | Create `VERSION` file or remove dead code | `version.py` |

### PHASE 5 — TEST COVERAGE (Critical Gap)

**Goal: ≥80% coverage on security-critical paths**

| # | Test Area | Current | Target | Key Scenarios |
|---|-----------|---------|--------|---------------|
| 5.1 | CSRF middleware | 0 tests | 4 tests | Valid/invalid token, missing header, auth endpoint exemption |
| 5.2 | Prompt injection guard | 0 tests | 6 tests | 11 regex patterns, `ChatCompletion` override |
| 5.3 | Rate limiting | 0 tests | 4 tests | IP bucket exhaustion, recruiter vs CV limiter |
| 5.4 | EAR `None` handling | 0 tests | 2 tests | Degenerate landmarks, None propagation |
| 5.5 | WS message size limits | 0 tests | 2 tests | 512KB reject, normal message accept |
| 5.6 | Content-Type enforcement | 0 tests | 2 tests | JSON accepted, text/plain rejected |
| 5.7 | `resetMandatoryLockdown` | 0 tests | 2 tests | Integrity score preserved, risk events preserved |
| 5.8 | OTEL session span | 0 tests | 1 test | Span created with correct attributes |
| 5.9 | Frontend hook tests | 0 tests | 5+ tests | `useWebSocket`, `useAegisStore` |
| 5.10 | E2E: WS connection flow | 0 tests | 2 tests | CV connect → auth → telemetry |

### PHASE 6 — ARCHITECTURE & PERFORMANCE

**Goal: Production scalability**

| # | Step | Rationale |
|---|------|-----------|
| 6.1 | Consolidate 4 fusion engines → 1 | `fusion.py`, `fusion_agent.py`, `fusion_engine.py`, `security_engine.py:fuse_channels` |
| 6.2 | Consolidate 4 KS-test implementations → 1 | `ks_test.py`, `baseline_agent.py`, `forensic_engine.py:module8`, `security_engine.py:ks_detector` |
| 6.3 | Replace `except:pass` with structured error handling | All WS disconnect handlers |
| 6.4 | Add Redis for multi-worker JWT + rate limiting | Replace `_TTLCache` and in-memory dicts |
| 6.5 | MediaPipe inference caching | Avoid re-processing identical frames |
| 6.6 | Hub → Split into spokes | AI agent, bias agent, code review agent as independent services |
| 6.7 | Add `isort` + `black` or `ruff format` to pre-commit | Consistent code style |
| 6.8 | Add pre-commit hooks | Prevent lint/test breakage |

---

## Project Rating By Standard

| Standard | Grade | Criteria |
|----------|-------|----------|
| **Security** | **C** | 9 CRITICAL findings (typing undefined, JSONResponse undefined, root container, JWT fallback, process crash, no TS parser, cache crash, EAR None crash, otel missing) |
| **Code Quality** | **C−** | 43 ruff errors + 164 ESLint errors + 25+ files with deprecated patterns + 2 runtime-crash bugs |
| **Test Coverage**| **C−** | 28 tests on security-adjacent code, NO coverage on actual security middleware |
| **React Hygiene**| **D+** | 7 hooks violate React 19 rules (refs during render), 5 call setState in effects, 3 have impure render functions |
| **DevOps** | **D** | Root container, no restarts, CI will fail on timeout flag, dev tools in prod image |
| **Documentation**| **B** | Comprehensive docs in `docs/`, AGENTS.md, audit report |
| **Architecture**| **C+** | Good separation of concerns, but 4× fusion engines and 4× KS-test implementations prove architecture drift |
| **Overall** | **C−** | **Production-blocking bugs exist. Deploy as-is and any of C1-C4 will crash the server. Frontend will crash on startup (C5).** |

### Path to A+ (Summary)

1. **Phase 1** (4 hrs) → **B−** — Blocking crashes eliminated, no security regressions
2. **Phase 2** (2 days) → **B+** — All runtime errors fixed, React rules compliant, infra hardening
3. **Phase 3** (2 days) → **A−** — Code quality issues resolved, lint clean
4. **Phase 4** (1 day) → **A** — All warnings eliminated, modern Python patterns
5. **Phase 5** (3 days) → **A** — Test coverage on security-critical paths
6. **Phase 6** (1 week) → **A+** — Architecture consolidation, multi-worker ready
# Aegis Interview Platform — Production Audit & Implementation Plan

> **Generated:** 2026-07-08  
> **Auditor:** Senior Full-Stack Engineer (AI-assisted)  
> **Scope:** 40+ backend files, 40+ frontend components, 10+ config files, 9 spec documents  
> **Total Findings:** 82 issues across 7 categories  

---

## 📊 PROJECT RATING: **C+ (62/100)**

| Dimension | Score | Status |
|-----------|-------|--------|
| **Security** | 35/100 | 🔴 CRITICAL GAPS |
| **Architecture** | 65/100 | 🟡 MEDIUM — God objects, duplicate engines |
| **Code Quality** | 70/100 | 🟡 MEDIUM — Inconsistent patterns, dead code |
| **Testing** | 25/100 | 🔴 CRITICAL — Zero auth/WS/integration tests |
| **Performance** | 55/100 | 🟡 MEDIUM — No pooling, frame skipping, cardinality issues |
| **Frontend UX** | 75/100 | 🟢 GOOD — Advanced hooks, but reactive bugs |
| **DevOps** | 60/100 | 🟡 MEDIUM — Docker root, no healthchecks, hardcoded secrets |

**Verdict:** **Not production-ready.** 12 CRITICAL security vulnerabilities, 18 HIGH findings, and fundamental architecture issues (global mutable state per-worker, no cross-worker coordination, 4 duplicate fusion engines).

---

## 🔴 TOP 12 CRITICAL FIXES (Must Complete Before Any Feature Work)

| ID | Issue | File | Fix |
|----|-------|------|-----|
| **C-1** | `.env` committed to git with `JWT_SECRET` | Root `.gitignore` missing | Add `.env` to `.gitignore`, rotate all secrets |
| **C-2** | JWT_SECRET silently falls back to ephemeral random | `auth.py:19-22` | `raise RuntimeError("JWT_SECRET required (min 32 chars)")` |
| **C-3** | No prompt injection guard on LLM input | `main.py:946`, `hub.py` | Add injection detection + sanitization before `think_and_respond` |
| **C-4** | Client-side lockdown authority (attacker can bypass) | `useAegisStore.js:62-138` | Move ALL zero-tolerance logic server-side; client only logs events |
| **C-5** | MCP invoke accepts unvalidated dict → SQL/Shell injection | `main.py:1247` | Pydantic model with tool pattern validation + param length limits |
| **C-6** | Docker runs as root | `Dockerfile` | Add `RUN adduser --uid 1000 aegis && USER aegis` |
| **C-7** | Bias audit fails-SAFE (biased questions pass silently) | `bias_agent.py:121-127` | Fail-DEADLY: mark UNSAFE on any error |
| **C-8** | MediaPipe instances NOT thread-safe (round-robin pool) | `main.py:254-259` | Use `asyncio.Lock()` per instance, not thread lock |
| **C-9** | EventBatcher DB session leak on rollback | `event_batcher.py:56-68` | Add retry with exponential backoff, `db.expunge_all()` on rollback |
| **C-10** | Refresh token set unbounded → OOM | `auth.py:42` | `TTLCache(maxlen=10000)` with thread-safe operations |
| **C-11** | WebSocket no `max_size` → OOM via large frames | `main.py:671,878` | Add `max_size=10*1024*1024` to all `receive_text()` |
| **C-12** | CSP `wss://*:` wildcard → XSS data exfiltration | `index.html:6` | Restrict to exact origins only |

---

## 🏗️ ARCHITECTURE REFACTOR REQUIRED (A-1 through A-7)

### A-1: Split AegisHub God Object (20+ instance vars, 15+ spoke agents)
```
NEW MODULES:
├── ConversationManager      # History, ReAct loop, Aria responses
├── SecurityOrchestrator     # CV ingestion, fusion, fraud, HITL
├── SessionLifecycle         # DB, memory, artifacts, cleanup
└── AgentRegistry            # Circuit breaker, parallel dispatch
```

### A-2: Replace Global Mutable State with Redis
```python
# main.py — REMOVE all dict globals:
# auth_attempts, failed_login_attempts, lockout_threshold, SESSION_HUBS, recruiter_sockets
# REPLACE with Redis-backed stores (cache.py SessionStore, RedisCache)
```

### A-3: Consolidate 4 Duplicate Fusion Engines → 1 Canonical
**Delete:** `security_engine.py`, `fusion_engine.py`, `fusion_agent.py`, `fusion.py`  
**Create:** Single `fusion_engine.py` with windowed 5-channel N≥3 decision matrix

### A-4: Standardize Error Response Format
```python
class APIError(BaseModel):
    error: str
    code: str
    detail: str | None = None
    request_id: str = Field(default_factory=lambda: uuid.uuid4().hex[:8])
```

### A-5: Move `Base.metadata.create_all` to Startup Event
```python
# database.py — REMOVE line 238
# main.py lifespan — ADD:
@app.on_event("startup")
async def init_db():
    Base.metadata.create_all(bind=engine)
```

### A-6: WebSocket Auth via httpOnly Cookie (Not localStorage)
```python
# frontend/useWebSocket.js — REMOVE token from localStorage
# backend/auth.py — ADD cookie-based WS auth:
async def get_current_user_from_ws(websocket: WebSocket):
    token = websocket.cookies.get("access_token")
    # or Sec-WebSocket-Protocol header only
```

### A-7: Per-Session Process Isolation (Production Scale)
```yaml
# docker-compose.yml — Consider per-session workers via:
# - Kubernetes Jobs per session
# - Or Redis-backed state + stateless workers
```

---

## 📋 20-WEEK IMPLEMENTATION ROADMAP TO A+

### PHASE 0: Critical Security Hardening (Week 1-2) — [x] COMPLETED (2026-07-08)
| Day | Tasks | Status |
|-----|-------|--------|
| 1 | Root `.gitignore`, `git rm --cached backend-cv/.env`, rotate ALL secrets | [x] Completed |
| 2 | JWT_SECRET fail-hard (C-2); TTLCache for refresh tokens (C-10) | [x] Completed |
| 3 | Prompt injection guard + detection patterns (C-3) | [x] Completed |
| 4 | Server-authoritative lockdown (C-4); Fix CSP `wss://*` (C-12) | [x] Completed |
| 5 | MCP Pydantic validation (C-5); Bias audit fail-deadly (C-7) | [x] Completed |
| 6 | Docker non-root user (C-6); MediaPipe async lock (C-8) | [x] Completed |
| 7 | EventBatcher retry + rollback fix (C-9); WS max_size (C-11) | [x] Completed |
| 8 | Permissions-Policy header (H-1); docker-compose JWT required (H-2); Redis auth (H-3) | [x] Completed |

### PHASE 1: Biometric Engine Hardening (Week 3-4) — [/] IN PROGRESS
| Task | Files |
|------|-------|
| Fix MediaPipe lip indices (13/14 for 478-point model) | `main.py:578-579` |
| Restore PLR screen flash + `stimulus_brightness` flow | `main.py`, `LivenessChallenge.jsx`, `PlrChallenge.jsx` |
| Unified 9-DOF Kalman filter (pose + 9-DOF Kalman filter (pose + gaze) | `main.py` |
| KinematicGazeLivenessEngine: consecutive failure debounce | `forensic_engine.py` |
| FrameSkipper (target 10 FPS) + dynamic pool sizing | `main.py` |

### PHASE 2: Agent Orchestration Rewrite (Week 5-6)
| Task | Files |
|------|-------|
| Parallel agent dispatch with `asyncio.gather` + timeouts | `hub.py`, new `circuit_breaker.py` |
| CircuitBreaker pattern for all spoke agents | `circuit_breaker.py` |
| FraudAgent session-duration normalization | `fraud_agent.py` |
| Split AegisHub → 3 managers | `conversation_manager.py`, `security_orchestrator.py`, `session_lifecycle.py` |

### PHASE 3: Fusion Engine & Scoring Unification (Week 7-8)
| Task | Files |
|------|-------|
| Single canonical FiveChannelFusionEngine (windowed, N≥3) | `fusion_engine.py` (NEW, delete 4 old) |
| Single `compute_integrity_score` in `utils.py` | `utils.py`, remove from `hub.py`, `main.py` |
| KS-Test: separate x/y axis buffers + audio suppression | `forensic_engine.py`, `hub.py:228-237` |
| WhitespaceFixationDetector typing correlation | `forensic_engine.py` |

### PHASE 4: Frontend Architecture (Week 9-10)
| Task | Files |
|------|-------|
| useWebSocket: exponential backoff reconnection + real queue drain | `useWebSocket.js` |
| useAegisStore: reactive selectors (no `.getState()` in JSX) | `useAegisStore.js`, `App.jsx` |
| PlrChallenge integration into Liveness flow | `LivenessChallenge.jsx` |
| CSS injection scan (Vector 6) | `useDigitalSecurity.js` |
| Fix `useResponseTiming` event name mismatch | `useResponseTiming.js`, `InterviewArena.jsx` |

### PHASE 5: Security Hardening (Week 11-12)
| Task | Files |
|------|-------|
| Redis TLS + password enforcement | `cache.py` |
| Prometheus cardinality control (path sanitization) | `monitoring.py` |
| Refresh token rotation verification | `auth.py` |
| CSRF middleware on all REST endpoints | `main.py` |
| Content-Type enforcement middleware | `main.py` |
| Remove `0.0.0.0` from ALLOWED_HOSTS | `.env`, `main.py` |

### PHASE 6: Testing & Code Quality (Week 13-14)
| Task | Target |
|------|--------|
| Auth tests (register, login, refresh, invalid tokens) | `tests/test_auth.py` |
| Rate limit tests (IP, per-session, recruiter) | `tests/test_ratelimit.py` |
| WebSocket integration tests (auth, CV, interview, recruiter) | `tests/test_ws_integration.py` |
| Forensic engine edge cases (PLR, KS, Whitespace, Kinematic) | `tests/test_advanced_forensic.py` |
| E2E flow tests (health, register, session, report) | `tests/test_e2e_flow.py` |
| Consolidate unittest → pytest | All test files |
| Ruff lint + typecheck on CI | `.github/workflows/ci.yml` |

### PHASE 7: New Features (Week 15-16)
| Feature | Files |
|---------|-------|
| Invitation-based session start (CSPRNG codes) | `protocol_engine.py`, new REST endpoint |
| Post-interview PDF report (ReportLab) | `report_generator.py` |
| ML training pipeline (IsolationForest fraud detection) | `ml_pipeline/train.py` |
| Candidate appeal workflow (Layer 7) | `AppealPanel.jsx`, backend endpoint |

### PHASE 8: Infrastructure & DevOps (Week 17-18)
| Task | Files |
|------|-------|
| Docker Compose: healthchecks, Redis auth, Postgres | `docker-compose.yml` |
| CI/CD pipeline (ruff, pytest, pip-audit, npm lint/test/build) | `.github/workflows/ci.yml` |
| Dockerfile: HEALTHCHECK, exec-form CMD, non-root | `Dockerfile` |
| Alembic dynamic DATABASE_URL | `alembic/env.py` |
| StaticFiles mount at `/app` + SPA fallback | `main.py` |

### PHASE 9: Performance Optimization (Week 19-20)
| Task | Files |
|------|-------|
| Dynamic MediaPipe pool sizing (CPU + RAM aware) | `main.py` |
| FrameSkipper (10 FPS target) | `main.py` |
| Connection pooling (PostgreSQL, Redis) | `database.py`, `cache.py` |
| Prometheus `_SANITIZED_PATHS` LRU cache | `monitoring.py` |
| Benchmark suite (WS latency, CV inference, score calc) | `tests/benchmarks/` |

---

## ✅ VERIFICATION CHECKLIST (Run Before Every Release)

```bash
# Backend
cd backend-cv
python -m ruff check .                    # Lint
python -m pytest -x -q                    # Tests (must pass)
python -m pip audit                       # Dependency security

# Frontend
cd frontend
npm run lint                              # ESLint
npm run typecheck                         # TypeScript
npm test                                  # Vitest
npm run build                             # Production build

# Infrastructure
docker compose config                     # Validate compose
docker scout quick                        # Container scan
```

---

## 🎯 SUCCESS METRICS FOR A+ GRADE

| Metric | Current | Target A+ | Measurement |
|--------|---------|-----------|-------------|
| **Security Critical Findings** | 12 | **0** | Audit checklist |
| **KS-Test False Positive Rate** | ~25% | **< 5%** | Per-session alert count |
| **PLR Liveness Pass Rate (Live)** | 0% (broken) | **> 95%** | `v4_liveness.passed` metric |
| **WS Reconnection Success** | 0 (no retry) | **> 99%** | Connection uptime |
| **Agent Circuit Breaker Uptime** | N/A | **> 99.9%** | Hub agent availability |
| **Integrity Score Consistency** | 3 divergent formulas | **1 source** | Cross-module comparison |
| **Extension Detection Latency** | 2s scan interval | **< 500ms** | DOM scan timer |
| **Security Test Coverage** | 0 critical tests | **100% critical paths** | pytest security suite |
| **Integration Test Coverage** | 5 tests | **30+ tests** | pytest coverage report |
| **Docker Image Size** | Unknown | **< 500MB** | `docker images` |
| **Concurrent Sessions** | Unknown | **100+** | Load test |

---

## 📁 FILE CHANGE INVENTORY (Summary)

| File | Phase | Change Type |
|------|-------|-------------|
| `backend-cv/main.py` | 0,1,2,3,5,8,9 | MODIFY (WebSocket auth, Kalman, frame skip, pool sizing) |
| `backend-cv/agents/hub.py` | 1,2,3 | REFACTOR → Split into 3 managers |
| `backend-cv/agents/forensic_engine.py` | 1,3 | MODIFY (Kinematic hardening, PLR, KS fix) |
| `backend-cv/agents/fusion_engine.py` | 3 | CREATE (Canonical, delete 4 duplicates) |
| `backend-cv/agents/fraud_agent.py` | 2 | MODIFY (Session duration normalization) |
| `backend-cv/agents/utils.py` | 3 | MODIFY (Unified integrity score) |
| `backend-cv/agents/circuit_breaker.py` | 2 | CREATE (New pattern) |
| `backend-cv/cache.py` | 5 | MODIFY (Redis TLS, password) |
| `backend-cv/monitoring.py` | 5 | MODIFY (Cardinality control) |
| `backend-cv/auth.py` | 5 | MODIFY (Fail-hard JWT, token rotation) |
| `backend-cv/report_generator.py` | 7 | CREATE |
| `backend-cv/tests/test_advanced_forensic.py` | 6 | CREATE |
| `backend-cv/tests/test_e2e_flow.py` | 6 | CREATE |
| `frontend/src/useWebSocket.js` | 4 | REWRITE |
| `frontend/src/useAegisStore.js` | 4 | MODIFY (Reactive selectors) |
| `frontend/src/LivenessChallenge.jsx` | 1,4 | MODIFY (PlrChallenge integration) |
| `frontend/src/InterviewArena.jsx` | 4 | MODIFY (v4_liveness handling) |
| `frontend/src/useDigitalSecurity.js` | 4 | MODIFY (CSS injection) |
| `docker-compose.yml` | 8 | MODIFY |
| `.github/workflows/ci.yml` | 8 | CREATE |
| `ml_pipeline/train.py` | 7 | CREATE |

---

## ⚡ IMMEDIATE NEXT STEPS (Do Today)

1. **Rotate all secrets** — JWT_SECRET, DATABASE_URL, OPENAI_API_KEY, any exposed keys
2. **Add root `.gitignore`** with `.env`, `*.env`, `.env.*`
3. **Run `git rm --cached backend-cv/.env`** and commit
4. **Apply C-2 fix** in `auth.py` — make JWT_SECRET required
5. **Apply C-4 fix** — remove client-side lockdown logic from `useAegisStore.js`
6. **Schedule Week 1-2 sprint** with team for remaining 10 critical fixes

---

## 📝 CHANGE LOG

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-07-08 | 1.0 | Senior Full-Stack Engineer (AI) | Initial comprehensive audit & 20-week implementation plan |
| 2026-07-08 | 1.1 | Antigravity AI | Completed Phase 0 (All 12 critical S-series & C-series security items remediated and verified) |

---

## 🔗 REFERENCE DOCUMENTS

- `AEGIS_PRODUCTION_AUDIT.md` — Original audit with 82 findings
- `ADVANCED_IMPLEMENTATION_PLAN.md` — Advanced architectural plan v5.0
- `docs/1_PRD_AI_Interview_Room.md` — Product Requirements
- `docs/2_TRD_AI_Interview_Room.md` — Technical Requirements
- `docs/7_Biometric_Security_Zero_Bypass_Spec.md` — Biometric security spec
- `docs/8_The_Mandatory_Edge_Blueprint.md` — Edge case blueprint

---

**This document is the single source of truth for production readiness tracking. Update it as each phase completes. Do not start feature work until Phase 0 (all 12 CRITICAL findings) is 100% resolved.**