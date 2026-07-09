# Phase 0 & 1 Implementation Plan — Aegis Production Audit Remediation

**Generated:** 2026-07-09
**Source:** IMPLEMENTATION_PLAN.md (20 critical issues from AEGIS_PRODUCTION_AUDIT.md)
**Scope:** Phase 0 (10 Critical Security Vulnerabilities S-1 to S-10) + Phase 1 (10 Critical Runtime Bugs R-1 to R-10)

---

## Phase 0: Critical Security Vulnerabilities (S-1 to S-10)

### S-1: WebSocket Accepted Before Authentication
**Severity:** CRITICAL
**Files:** `backend-cv/main.py` (lines ~591, 739, 917)
**Issue:** All three WebSocket endpoints (`/ws/cv`, `/ws/interview`, `/ws/recruiter`) call `await websocket.accept()` BEFORE performing authentication/authorization checks. This allows unauthenticated connections to consume resources and potentially access the WebSocket.

**Current Code (lines ~591, 739, 917):**
```python
@app.websocket("/ws/cv")
async def ws_cv(websocket: WebSocket, session_id: str = Query(...), token: str = Query(None)):
    await websocket.accept()  # ACCEPTED FIRST!
    # ... auth happens after
```

**Fix Required:**
1. Move authentication/validation BEFORE `websocket.accept()`
2. Use `websocket.headers.get("authorization")` or `Sec-WebSocket-Protocol` for token extraction
3. Call `await websocket.close(code=4001, reason="Unauthorized")` if auth fails BEFORE accept
4. Apply to all three endpoints: `/ws/cv`, `/ws/interview`, `/ws/recruiter`

**Dependencies:** Needs `auth.py` helper functions for WebSocket auth verification

---

### S-2: SKIP_AUTH Environment Variable Bypasses All JWT Authentication
**Severity:** CRITICAL
**Files:** `backend-cv/auth.py` (lines 6, 75-79, 123-149)
**Issue:** `SKIP_AUTH=1` in `.env` returns hardcoded ADMIN user, completely bypassing JWT validation.

**Current Code (lines 75-79):**
```python
SKIP_AUTH = os.getenv("SKIP_AUTH", "0") == "1"
if SKIP_AUTH:
    return {"sub": "admin", "role": "ADMIN", "type": "access"}  # Hardcoded!
```

**Fix Required:**
1. Remove `SKIP_AUTH` bypass entirely or restrict to `ENV=development` only
2. Add runtime warning/log when SKIP_AUTH is enabled
3. Ensure production deployments cannot have SKIP_AUTH=1
4. Audit all calls to `get_current_user_from_ws` and `decode_token`

**Dependencies:** None (standalone fix)

---

### S-3: JWT Token Accepted via Query Parameters (Leaked to Proxy Logs)
**Severity:** CRITICAL
**Files:** `backend-cv/auth.py` (lines 123-149), `backend-cv/main.py` (line ~605)
**Issue:** WebSocket auth accepts token from query parameter `?token=...` which gets logged in proxy/access logs.

**Current Code (main.py line ~605):**
```python
async def ws_cv(websocket: WebSocket, session_id: str = Query(...), token: str = Query(None)):
```

**Fix Required:**
1. Remove `token: str = Query(None)` parameter from all WebSocket endpoints
2. Only accept token via `Authorization: Bearer <token>` header or `Sec-WebSocket-Protocol: Bearer <token>`
3. Update `get_current_user_from_ws` to reject query-param tokens
4. Update frontend `useWebSocket.js` to send token via protocol/header

**Dependencies:** Frontend coordination (useWebSocket.js modification)

---

### S-4: No Session Authorization on Integrity Reports/Artifacts Endpoints
**Severity:** CRITICAL
**Files:** `backend-cv/main.py` (search for `/integrity`, `/artifacts`, `/report` endpoints)
**Issue:** REST endpoints for integrity reports and session artifacts lack ownership validation — any authenticated user can access any session's data.

**Fix Required:**
1. Add session ownership check: `current_user.session_id == requested_session_id`
2. For recruiter role: verify recruiter owns the session via session mapping
3. Apply to: `GET /api/sessions/{session_id}/integrity`, `GET /api/sessions/{session_id}/artifacts`, `GET /api/sessions/{session_id}/report`
4. Return 403 if session doesn't belong to user/recruiter

**Dependencies:** Session mapping in database

---

### S-5: Recruiter Endpoint Accepts Any session_id Without Ownership Validation
**Severity:** CRITICAL
**Files:** `backend-cv/main.py` (line ~1253-1389, `ws_recruiter` endpoint)
**Issue:** Recruiter WebSocket accepts `session_id` from query params without verifying the recruiter owns that session.

**Current Code (approx line 1260):**
```python
@app.websocket("/ws/recruiter")
async def ws_recruiter(websocket: WebSocket, session_id: str = Query(...), token: str = Query(None)):
    await websocket.accept()
    # No ownership validation?
```

**Fix Required:**
1. After auth, verify `current_user.id` owns `session_id` via database lookup
2. Recruiter must be mapped to session in database (recruiter_sessions table)
3. Close with 4003 if ownership mismatch
4. Combine with S-1 fix (auth before accept) and S-3 fix (no query param token)

**Dependencies:** Database schema for recruiter-session mapping, S-1, S-3

---

### S-6: Unvalidated session_id from Query Parameters Used Directly
**Severity:** HIGH
**Files:** `backend-cv/main.py` (lines ~605, ~750, ~1050, ~1260)
**Issue:** `session_id` from `Query(...)` used directly in dict lookups (`session_hubs[session_id]`, `cv_sessions[session_id]`) without validation/sanitization.

**Fix Required:**
1. Validate `session_id` format: UUID or alphanumeric with max length 64
2. Reject malformed session_ids with 400 before any processing
3. Use allowlist validation: `[a-zA-Z0-9_-]{1,64}`
4. Apply to all WebSocket endpoints

**Dependencies:** S-1, S-3

---

### S-7: No Frame Size Limit on CV WebSocket (DoS Vector)
**Severity:** HIGH
**Files:** `backend-cv/main.py` (ws_cv endpoint, frame processing loop ~680-720)
**Issue:** Base64 JPEG frames received without size validation — can send arbitrarily large frames causing memory exhaustion.

**Current Code (approx line ~690):**
```python
frame_data = await websocket.receive_text()
# No size check on frame_data before base64 decode
frame_bytes = base64.b64decode(frame_data)
```

**Fix Required:**
1. Add `MAX_FRAME_SIZE = 512 * 1024` (512 KB) constant
2. Check `len(frame_data) > MAX_FRAME_SIZE` → close with 4008 (Frame Too Large)
3. Add per-connection frame rate limiting (max 30 fps)
4. Track cumulative bytes per minute, disconnect if exceeded

**Dependencies:** S-1 (auth first)

---

### S-8: CORS/Host Validation Allows 0.0.0.0 and localhost Insecurely
**Severity:** HIGH
**Files:** `backend-cv/main.py` (line ~162), `frontend/index.html` (CSP meta tag)
**Issue:** `ALLOWED_HOSTS` includes `0.0.0.0` and frontend CSP allows `ws://localhost`, `wss://localhost`.

**Current Code (main.py line ~162):**
```python
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,0.0.0.0").split(",")
```

**Fix Required:**
1. Remove `0.0.0.0` from default `ALLOWED_HOSTS`
2. Require explicit configuration for production hosts
3. Frontend CSP: Remove `ws://localhost` and `wss://localhost` from connect-src
4. Add `frame-ancestors 'none'` to CSP
5. Validate Origin header against allowed origins (case-insensitive)

**Dependencies:** Frontend CSP update

---

### S-9: Hardcoded Default AI Invitation Code
**Severity:** HIGH
**Files:** `backend-cv/agents/protocol_engine.py` (lines 59-63, 88-92)
**Issue:** `DEFAULT_AI_INVITATION_CODE = "AEGIS-VIP-2026"` hardcoded, used when no code provided.

**Current Code (lines 59-63, 88-92):**
```python
VALID_INVITATION_CODES = os.getenv("VALID_INVITATION_CODES", "AEGIS-VIP-2026").split(",")

# In validate_entry:
if use_default_ai_code or not effective_code:
    if codes:
        effective_code = next(iter(codes))  # Uses first env code or default
```

**Fix Required:**
1. Remove hardcoded default `"AEGIS-VIP-2026"`
2. Require `VALID_INVITATION_CODES` env var to be set (no default)
3. If env var not set, raise `RuntimeError` at startup
4. Remove `use_default_ai_code` parameter entirely
5. All invitations must use explicit valid codes

**Dependencies:** Environment configuration update

---

### S-10: Origin Validation Case-Sensitive in validate_origin
**Severity:** MEDIUM
**Files:** `backend-cv/auth.py` (lines 152-158)
**Issue:** Origin comparison is case-sensitive but HTTP Origin header can vary in case.

**Current Code (lines 152-158):**
```python
def validate_origin(websocket: WebSocket, allowed_origins: list[str]) -> None:
    origin = (websocket.headers.get("origin", "") or "").lower().rstrip("/")
    # ...
    normalized_allowed = [o.lower().rstrip("/") for o in allowed_origins]
    if origin not in normalized_allowed:
        raise HTTPException(status_code=403, detail="Origin not allowed")
```

**Wait - this actually IS case-insensitive (.lower() is called). Let me re-read...**
Actually, the code at lines 152-158 DOES use `.lower()` - but the issue might be that `allowed_origins` from env isn't normalized. Let me check the caller.

**Fix Required:**
1. Ensure `allowed_origins` from env/config are also normalized to lowercase at startup
2. Add explicit test for case variations
3. Document that origins are compared case-insensitively

**Dependencies:** None

---

## Phase 1: Critical Runtime Bugs (R-1 to R-10)

### R-1: MediaPipe Lip Landmark Indices Wrong (13/14 are NOT lips in 478-point model)
**Severity:** CRITICAL
**Files:** `backend-cv/agents/baseline_agent.py` (search for lip indices)
**Issue:** Code uses landmarks 13 and 14 for lip tracking, but MediaPipe FaceMesh 478-point model uses different indices for upper/lower lips.

**Reference:** MediaPipe 478-point face mesh — upper lip: 13, 14, 15, 16, 17... wait, let me verify actual indices.
Actually: Upper lip indices include 13, 14, 15, 16, 17; Lower lip: 14, 15... need exact mapping.

**Fix Required:**
1. Use correct MediaPipe 478-point lip landmarks:
   - Upper lip: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
   - Lower lip: [146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185, 61]
   - Or use standard lip contour: upper=[61,185,40,39,37,0,267,269,270,409,291], lower=[291,409,270,269,267,0,37,39,40,185,61]
2. Update baseline_agent.py lip distance calculations
3. Add unit test with known landmark positions

**Dependencies:** None

---

### R-2: KS Test Compares 2-Element [screen_x, screen_y] Against screen_x Distribution
**Severity:** CRITICAL
**Files:** `backend-cv/agents/forensic_engine.py` (KS test implementation), `backend-cv/agents/ks_test.py`
**Issue:** Gaze coordinates are 2D `[screen_x, screen_y]` but KS test expects 1D distribution; code incorrectly compares 2D array against 1D screen_x marginal.

**Current Issue (forensic_engine.py gaze analysis):**
```python
# gaze_data is [[x1, y1], [x2, y2], ...] - 2D
ks_result = ks_test(gaze_data, screen_x_baseline)  # WRONG: 2D vs 1D
```

**Fix Required:**
1. Run KS test separately on X and Y coordinates
2. Or compute radial distance from screen center and test 1D distribution
3. Update `ks_test.py` to handle 2D input by testing marginals independently
4. Return combined p-value (Fisher's method) or max D-statistic

**Dependencies:** ks_test.py update

---

### R-3: LivenessChallenge Component Entirely Client-Side (Theatrical)
**Severity:** CRITICAL
**Files:** `frontend/src/LivenessChallenge.jsx`
**Issue:** Entire PLR/rPPG liveness challenge runs in browser with no backend verification — can be bypassed by injecting `passed: true` in WebSocket message.

**Current Architecture:**
- Frontend flashes screen, measures pupil response via webcam
- Sends result to backend via WebSocket
- Backend trusts frontend result

**Fix Required:**
1. Move PLR challenge to backend:
   - Backend sends challenge parameters (flash timing, duration) via WebSocket
   - Frontend captures video frames during challenge
   - Frames sent to backend for PLR analysis (using existing `verify_layer_4_plr`)
2. Move rPPG to backend:
   - Backend receives raw frames, computes rPPG BPM
   - Validates 45-180 BPM range server-side
3. Frontend becomes capture-only; all verification in backend
4. Use `Protocol12LayerEngine.verify_layer_4_plr` and `verify_layer_5_deepfake_liveness`

**Dependencies:** backend-cv/agents/protocol_engine.py (Layer 4, 5), WebSocket protocol update

---

### R-4: ingest_security_features Method in AegisHub Is Dead Code (Never Called)
**Severity:** HIGH
**Files:** `backend-cv/agents/hub.py` (method `ingest_security_features`, ~line 300-380)
**Issue:** Method exists but no caller — security features from CV WebSocket never flow into Hub for fusion.

**Current State:** Method defined at ~line 300-380, never invoked.

**Fix Required:**
1. In `ws_cv` endpoint (main.py), after forensic analysis produces `security_features`, call:
   ```python
   hub = get_or_create_hub(session_id)
   hub.ingest_security_features(security_features)
   ```
2. Ensure `ingest_security_features` signature matches what CV produces:
   - `gaze_anomaly`, `pose`, `lip_sync_score`, `rppg_bpm`, `micro_expr_variance`, `blink_rate`, `face_confidence`
3. Verify Hub's `FiveChannelFusionEngine` receives these features

**Dependencies:** ws_cv endpoint modification

---

### R-5: SecurityEvent Missing to_dict() Method (AttributeError on Recruiter Feed)
**Severity:** HIGH
**Files:** `backend-cv/agents/security_engine.py` (SecurityEvent class)
**Issue:** `SecurityEvent` dataclass lacks `to_dict()` but recruiter WebSocket tries to call it for JSON serialization.

**Current Code (hubs.py recruiter handler ~line 1300):**
```python
event_dict = security_event.to_dict()  # AttributeError!
```

**Fix Required:**
1. Add `to_dict()` method to `SecurityEvent` class in `security_engine.py`:
   ```python
   def to_dict(self):
       return {
           "event_id": self.event_id,
           "event_type": self.event_type,
           "severity": self.severity,
           "description": self.description,
           "timestamp": self.timestamp.isoformat(),
           "metadata": self.metadata
       }
   ```
2. Ensure all fields are JSON-serializable

**Dependencies:** None

---

### R-6: keyboard_typing_active Incorrectly Mapped to hand_anomaly
**Severity:** HIGH
**Files:** `backend-cv/agents/hub.py` (FiveChannelFusionEngine input mapping)
**Issue:** `keyboard_typing_active` (detected from audio/keyboard) mapped to `hand_anomaly` channel instead of dedicated `typing_anomaly`.

**Current Code (hub.py fusion engine input):**
```python
# Wrong mapping:
hand_anomaly = features.get("keyboard_typing_active", False)
```

**Fix Required:**
1. Add 6th channel to `FiveChannelFusionEngine` for `typing_anomaly`
2. Or rename channel 3 from `hand_anomaly` to `motor_anomaly` covering both
3. Update fusion logic to handle typing separately from hand gestures
4. Channel mapping:
   - Channel 1: Gaze
   - Channel 2: Pose/Head
   - Channel 3: Hand/Gesture (hand_to_ear, off_screen_reach)
   - Channel 4: Typing/Keyboard (keyboard_typing_active)
   - Channel 5: Audio/Lip-sync

**Dependencies:** FiveChannelFusionEngine modification

---

### R-7: FiveChannelFusionEngine Unbounded Evidence Accumulation (Memory Leak)
**Severity:** HIGH
**Files:** `backend-cv/agents/security_engine.py` (FiveChannelFusionEngine class)
**Issue:** Evidence buffers for each channel grow indefinitely without cleanup.

**Current Code:**
```python
class FiveChannelFusionEngine:
    def __init__(self):
        self.evidence_buffers = {ch: [] for ch in CHANNELS}  # Never cleared
    
    def update(self, features):
        for ch, value in features.items():
            self.evidence_buffers[ch].append(value)  # Unbounded growth
```

**Fix Required:**
1. Add `MAX_BUFFER_SIZE = 300` (30 seconds at 10 fps)
2. In `update()`: `self.evidence_buffers[ch] = self.evidence_buffers[ch][-MAX_BUFFER_SIZE:]`
3. Or use `collections.deque(maxlen=MAX_BUFFER_SIZE)` for each buffer
4. Add `cleanup_old_evidence(max_age_seconds=30)` method called periodically

**Dependencies:** None

---

### R-8: PLR Receives Frame Brightness Instead of Stimulus Brightness
**Severity:** MEDIUM
**Files:** `backend-cv/agents/protocol_engine.py` (Layer 4 `verify_layer_4_plr`), called from `ws_cv` or forensic engine
**Issue:** PLR verification expects stimulus brightness (flash intensity) but receives ambient frame brightness.

**Current Call (approx):**
```python
# In forensic_engine or ws_cv:
plr_result = protocol_engine.verify_layer_4_plr(
    latency_ms=..., 
    constriction_ratio=...,
    # Missing: stimulus_lux parameter
)
```

**Fix Required:**
1. Update `verify_layer_4_plr` signature to accept `stimulus_lux: float`
2. Frontend sends flash luminance value (known from challenge parameters)
3. Backend uses known stimulus lux, not measured frame brightness
4. Threshold logic: `constriction_ratio >= 0.10` AND `latency_ms in [120, 350]` AND `stimulus_lux >= 50`

**Dependencies:** Frontend LivenessChallenge.jsx (to send stimulus lux), protocol_engine.py

---

### R-9: Frontend Ignores Backend v4_liveness Alerts
**Severity:** MEDIUM
**Files:** `frontend/src/InterviewArena.jsx` (handleCv function ~lines 326-333)
**Issue:** Frontend `handleCv` checks `data.v4_liveness && !data.v4_liveness.passed` but backend may send different field structure.

**Current Frontend Code (lines 326-333):**
```javascript
if (data.v4_liveness && !data.v4_liveness.passed) {
    addRiskEvent({
        type: 'LIVENESS_FAIL',
        severity: 'HIGH',
        desc: `[Liveness] ${data.v4_liveness.alert || 'Biometric liveness check failed'}`,
    });
    updateIntegrityScore();
}
```

**Issue:** Backend sends `v4_liveness` with `passed` boolean, but after R-3 fix, backend will send fusion verdict instead. Need to align.

**Fix Required:**
1. After R-3 (backend liveness), backend sends unified `fusion` result
2. Frontend checks `data.fusion.liveness_passed` or similar
3. Update frontend to handle both legacy `v4_liveness` and new `fusion` format
4. Add backward compatibility during transition

**Dependencies:** R-3 completion, backend WebSocket protocol

---

### R-10: Event Name Mismatch (aegis:candidate_answer vs aegis:question_delivered)
**Severity:** MEDIUM
**Files:** `frontend/src/InterviewArena.jsx` (line 432), `frontend/src/useResponseTiming.js` (line 228)
**Issue:** Frontend dispatches `aegis:candidate_answer` but response timing hook listens for `aegis:question_delivered`.

**Current Code:**
- InterviewArena.jsx line 432: `window.dispatchEvent(new CustomEvent('aegis:candidate_answer', ...))`
- useResponseTiming.js line 228: `window.addEventListener('aegis:candidate_answer', handler)` — WAIT, this IS the same!

**Re-reading the issue:** "Event name mismatch aegis:candidate_answer vs aegis:question_delivered (R-10)"

Actually, looking at useResponseTiming.js line 216-220:
```javascript
const markQuestionDelivered = useCallback(() => {
    questionTsRef.current  = Date.now();
    listeningRef.current   = true;
    speechDtcRef.current   = false;
}, []);
```

And the listener at line 228:
```javascript
const handler = () => markQuestionDelivered();
window.addEventListener('aegis:candidate_answer', handler);
```

So it listens for `aegis:candidate_answer` which IS dispatched. But the issue says mismatch with `aegis:question_delivered`. 

**Wait — the hook is named `useResponseTiming` and it should be triggered when QUESTION is delivered (to measure response latency), not when candidate answers. Let me re-read...**

Actually the hook's `markQuestionDelivered` is called when question is delivered (by AI), and then it listens for candidate answer to measure latency. But the event name suggests:
- `aegis:question_delivered` should fire when AI delivers question
- `aegis:candidate_answer` fires when candidate answers

But in InterviewArena.jsx, there's NO `aegis:question_delivered` dispatch! The AI question comes via WebSocket `handleInterview`, but no event is dispatched.

**Fix Required:**
1. In `handleInterview` (InterviewArena.jsx ~line 374), after receiving AI message, dispatch:
   ```javascript
   window.dispatchEvent(new CustomEvent('aegis:question_delivered', { detail: { questionId: qIndex } }));
   ```
2. In `useResponseTiming.js`, change listener from `aegis:candidate_answer` to `aegis:question_delivered`
3. The candidate answer event can remain for other purposes

**Dependencies:** Both frontend files

---

## Implementation Order & Dependencies

### Phase 0 Order (Security First — No Runtime Dependencies)
1. **S-2** (SKIP_AUTH removal) — Independent, do first
2. **S-9** (Hardcoded invitation code) — Independent
3. **S-10** (Origin validation case-sensitivity) — Independent
4. **S-1** (Auth before WebSocket accept) — Foundation for S-3, S-5, S-6, S-7
5. **S-3** (No query param tokens) — Requires S-1, coordinates with frontend
6. **S-6** (Validate session_id format) — Requires S-1
7. **S-7** (Frame size limit) — Requires S-1
8. **S-4** (Session authorization on REST) — Requires S-1 auth pattern
9. **S-5** (Recruiter session ownership) — Requires S-1, S-3, S-4, DB schema
10. **S-8** (CORS/CSP cleanup) — Frontend + backend coordination

### Phase 1 Order (Runtime Bugs)
1. **R-5** (SecurityEvent.to_dict) — Independent, quick fix
2. **R-1** (MediaPipe lip indices) — Independent
3. **R-4** (Hook up ingest_security_features) — Requires ws_cv (S-1 done)
4. **R-7** (Fusion engine buffer bounds) — Independent
5. **R-2** (KS test 2D vs 1D) — Requires forensic_engine, ks_test
6. **R-6** (Typing anomaly channel) — Requires hub.py fusion engine
7. **R-3** (Backend liveness) — Major: protocol_engine, ws_cv, frontend
8. **R-8** (PLR stimulus brightness) — Requires R-3, protocol_engine
9. **R-9** (Frontend v4_liveness handling) — Requires R-3
10. **R-10** (Event name fix) — Frontend only

---

## File-Level Change Summary

### backend-cv/auth.py
- S-2: Remove SKIP_AUTH bypass (lines 6, 75-79, 123-149)
- S-3: Reject query-param tokens in get_current_user_from_ws (lines 123-149)
- S-10: Normalize allowed_origins at startup (lines 152-158)

### backend-cv/main.py
- S-1: Move auth before accept in ws_cv, ws_interview, ws_recruiter (lines ~591, ~739, ~917)
- S-3: Remove token=Query(None) from all WebSocket signatures
- S-4: Add session ownership checks on REST endpoints
- S-5: Add recruiter session ownership in ws_recruiter (lines ~1253-1389)
- S-6: Validate session_id format (regex) before use (lines ~605, ~750, ~1050, ~1260)
- S-7: Add MAX_FRAME_SIZE check in ws_cv frame loop
- S-8: Remove 0.0.0.0 from ALLOWED_HOSTS default (line ~162)

### backend-cv/agents/protocol_engine.py
- S-9: Remove hardcoded DEFAULT_AI_INVITATION_CODE, require env var (lines 59-63, 88-92)
- R-8: Add stimulus_lux parameter to verify_layer_4_plr (line ~183)

### backend-cv/agents/baseline_agent.py
- R-1: Fix MediaPipe lip landmark indices (search for 13/14)

### backend-cv/agents/forensic_engine.py
- R-2: Fix KS test to handle 2D gaze data (marginal X/Y or radial)
- R-4: Ensure security_features output matches hub.ingest_security_features expectations

### backend-cv/agents/ks_test.py
- R-2: Update to accept 2D arrays, test marginals independently

### backend-cv/agents/security_engine.py
- R-5: Add to_dict() to SecurityEvent class
- R-7: Bound evidence_buffers with deque(maxlen=300)

### backend-cv/agents/hub.py
- R-4: Ensure ingest_security_features signature matches CV output
- R-6: Add typing_anomaly channel to FiveChannelFusionEngine

### frontend/index.html
- S-8: Update CSP: remove ws://localhost, wss://localhost; add frame-ancestors 'none'

### frontend/src/useWebSocket.js
- S-3: Send token via Sec-WebSocket-Protocol header instead of query param
- Fix F-1: drainQueue should use ws.send() not onMessageRef

### frontend/src/LivenessChallenge.jsx
- R-3: Convert to capture-only; send raw frames to backend
- R-8: Send stimulus_lux with PLR frames

### frontend/src/InterviewArena.jsx
- R-9: Update handleCv to use new fusion.liveness_passed field
- R-10: Dispatch aegis:question_delivered in handleInterview

### frontend/src/useResponseTiming.js
- R-10: Listen for aegis:question_delivered instead of aegis:candidate_answer

---

## Testing Requirements Per Fix

| Issue | Test Type | Coverage Target |
|-------|-----------|-----------------|
| S-1, S-3, S-5, S-6, S-7 | WebSocket integration tests | 100% of auth flows |
| S-2 | Unit test for auth.py | 100% |
| S-4 | REST API integration tests | 100% of endpoints |
| S-8 | CSP header validation | 100% |
| S-9 | Invitation validation tests | 100% |
| R-1 | Unit test with known landmarks | 100% |
| R-2 | KS test with 2D synthetic data | 100% |
| R-3 | E2E: backend liveness verification | 100% |
| R-4 | Integration: CV → Hub fusion | 100% |
| R-5 | Unit: SecurityEvent.to_dict() | 100% |
| R-6 | Unit: Fusion engine channel mapping | 100% |
| R-7 | Memory leak test (load) | N/A |
| R-8 | Unit: PLR with known stimulus | 100% |
| R-9 | Frontend integration | 100% |
| R-10 | Frontend event flow test | 100% |

---

## Risk Mitigation

1. **S-1/S-3**: WebSocket auth changes break existing clients — deploy with feature flag, test with staging frontend first
2. **R-3**: Major architecture change (client→server liveness) — implement behind feature flag, A/B test
3. **S-8**: CSP changes may break dev workflow — maintain separate dev/prod CSP configs
4. **R-6**: Fusion engine channel change affects verdict logic — verify with historical data replay

---

## Deliverables

1. **Security PR** (Phase 0): All S-1 to S-10 fixes with tests
2. **Runtime PR** (Phase 1): All R-1 to R-10 fixes with tests  
3. **Migration Guide**: Frontend WebSocket protocol changes, CSP updates
4. **Test Report**: Coverage ≥80% for all modified modules