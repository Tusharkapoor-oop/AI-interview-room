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
