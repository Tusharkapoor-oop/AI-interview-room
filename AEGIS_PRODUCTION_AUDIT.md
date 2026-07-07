# Aegis Interview Platform — Production Audit & Implementation Plan

> **Generated after exhaustive audit of 40+ backend files, 40+ frontend files, 10+ config files.**
> **Total findings: 82 issues across 7 categories.**

---

## EXECUTIVE SUMMARY

### Severity Distribution

| Severity | Count | Action Required |
|----------|-------|-----------------|
| 🔴 CRITICAL | 12 | Fix before any production deployment |
| 🟠 HIGH | 18 | Fix within first sprint |
| 🟡 MEDIUM | 22 | Fix within first month |
| 🔵 LOW | 15 | Fix as time permits |
| 🟣 PERFORMANCE | 8 | Address at scale |
| 🔷 ARCHITECTURE | 7 | Plan major refactor |

---

## 🔴 CRITICAL FINDINGS (12) — Fix Immediately

### C-1: `.env` Committed to Git (No Root `.gitignore`)
**Files:** `backend-cv/.env`, (missing) `.gitignore`
**Code:** `JWT_SECRET=dev-secret-change-in-production-min-32-chars!!`
**Issue:** The `.env` file with JWT_SECRET, DATABASE_URL, and OPENAI_API_KEY is tracked in git. Anyone with repo access sees production secrets.
**Fix:**
```gitignore
# Root .gitignore
.env
.env.local
.env.production
*.env
```
```bash
git rm --cached backend-cv/.env
git commit -m "fix: remove .env from version control"
```

### C-2: JWT_SECRET Silently Falls Back to Ephemeral Random
**File:** `backend-cv/auth.py:19-22`
**Code:**
```python
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET or len(JWT_SECRET) < 32:
    JWT_SECRET = secrets.token_hex(32)
```
**Issue:** Every restart generates a NEW signing key, invalidating all tokens. No warning about broken auth. Memory dump leaks the secret.
**Fix:**
```python
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET or len(JWT_SECRET) < 32:
    raise RuntimeError(
        "JWT_SECRET environment variable is required (min 32 chars). "
        "Set it before starting the server."
    )
```

### C-3: Prompt Injection — No Input Sanitization on LLM Messages
**File:** `backend-cv/main.py:946`
**Code:**
```python
text = validated.message.strip()
# ...
reply = await hub.think_and_respond(text)
```
**Issue:** Candidate text goes directly to GPT-4o with no prompt injection guard, no system prompt enforcement metrics, and no output guardrails. An attacker can inject "ignore all previous instructions" type attacks.
**Fix:**
```python
# Add before hub.think_and_respond:
sanitized = _sanitize_llm_input(text)
reply = await hub.think_and_respond(sanitized)
```
Add injection detection in hub.py:
```python
INJECTION_PATTERNS = [
    r'ignore\s+all\s+(previous|prior)\s+(instructions|directions)',
    r'system\s+prompt',
    r'you\s+are\s+(not|now)',
    r'forget\s+(everything|all)',
    r'new\s+(instructions|directive|command)',
]
def _detect_injection(text: str) -> bool:
    return any(re.search(p, text, re.I) for p in INJECTION_PATTERNS)
```

### C-4: Dual State Authority — Client Triggers Lockdown Before Server Validates
**File:** `frontend/src/useAegisStore.js:62-138`
**Code:**
```javascript
addRiskEvent: (event) => {
    set((s) => {
        const isDisqualified =
            highSeverityEvents.length >= 1 ||
            mediumEvents.length >= 2 ||
            newEvents.some(e => ZERO_TOLERANCE_SIGNALS.has(e.type));

        if (isDisqualified && !s.strictMandatoryLockdown && !s._lockdownFired) {
            return {
                strictMandatoryLockdown: true,
                mandatoryLockdownReason: `DEFCON 1 BIOMETRIC BREACH...`,
                phase: 'report',
            };
        }
    });
```
**Issue:** Client-side code determines disqualification from local event state. An attacker can:
- Block `addRiskEvent` calls entirely (never get disqualified)
- Modify `ZERO_TOLERANCE_SIGNALS` set
- Set `_lockdownFired: true` to prevent future lockdowns
- Modify `riskEvents` array to remove incriminating events

**Fix:** Move all zero-tolerance logic server-side. Client sends raw events to server; server returns verdict.
```javascript
// Client side — simplified
addRiskEvent: (event) => {
    set((s) => {
        const newEvents = [...s.riskEvents, { id: Date.now(), ...event }]
            .slice(-500);
        return { riskEvents: newEvents };
    });
    // Server verdict is authoritative — applied via setServerIntegrityScore
},
```

### C-5: MCP invoke accepts unvalidated `body: dict`
**File:** `backend-cv/main.py:1247-1259`
**Code:**
```python
async def invoke_mcp_tool(body: dict, user: dict = Depends(require_auth)):
    tool_path = body.get("tool")
    params = body.get("params", {})
    result = await mcp_client.invoke(tool_path, params, ...)
```
**Issue:** No Pydantic schema. `params` dict passed directly to MCP tool handlers (SQLite, GitHub). A compromised ADMIN JWT can inject arbitrary SQL or GitHub operations.
**Fix:**
```python
from pydantic import BaseModel

class MCPInvokeRequest(BaseModel):
    tool: str = Field(..., pattern=r'^[a-zA-Z_][a-zA-Z0-9_/]*$')
    params: dict = Field(default_factory=dict)

    @field_validator("params")
    @classmethod
    def validate_params(cls, v):
        if not isinstance(v, dict):
            raise ValueError("params must be a dict")
        return {k: str(v)[:1000] for k, v in v.items()}  # length limit
```

### C-6: Docker Container Runs as Root
**File:** `backend-cv/Dockerfile`
**Issue:** No `USER` directive — the container runs as root. If an attacker exploits the app, they get root access to the container.
**Fix:**
```dockerfile
RUN adduser --disabled-password --gecos '' --uid 1000 aegis
USER aegis
```

### C-7: Bias Audit Fail-Deadly — Silent SAFE on Error
**File:** `backend-cv/agents/bias_agent.py:121-127`
**Code:**
```python
except Exception as e:
    log.warning("[BiasAuditAgent] AI audit failed (fail-safe: SAFE): %s", e)
result = BiasAuditResult(question=question, safe=True, flags=[])
```
**Issue:** If GPT call or JSON parsing fails, the question is silently marked SAFE. Biased/illegal questions pass through undetected.
**Fix:**
```python
except Exception as e:
    log.error("[BiasAuditAgent] AI audit failed (fail-deadly: UNSAFE): %s", e)
    return BiasAuditResult(
        question=question,
        safe=False,
        flags=["audit_unavailable"],
        suggestion="AI audit unavailable; flagged for human review."
    )
```

### C-8: MediaPipe Instance Thread Safety Violation
**File:** `backend-cv/main.py:254-259`
**Code:**
```python
def acquire_cv_instances():
    global cv_pool_index
    with cv_pool_lock:
        idx = cv_pool_index
        cv_pool_index = (cv_pool_index + 1) % cv_pool_size
        return face_pool[idx], hand_pool[idx]
```
**Issue:** Round-robin pool index is protected, but MediaPipe instances are NOT thread-safe. Two concurrent asyncio tasks sharing the same instance corrupt internal state.
**Fix:**
```python
import asyncio
_cv_lock = asyncio.Lock()

async def acquire_cv_instances():
    async with _cv_lock:
        idx = cv_pool_index
        cv_pool_index = (cv_pool_index + 1) % cv_pool_size
        return face_pool[idx], hand_pool[idx]
```

### C-9: EventBatcher DB Session Leak on Rollback
**File:** `backend-cv/event_batcher.py:56-68`
**Issue:** On rollback, uncommitted objects remain in session; `db.close()` releases them. With `check_same_thread=False` (SQLite) and async background flush, this causes database corruption from concurrent writes.
**Fix:**
```python
async def _flush(self):
    db = self.db_session_factory()
    try:
        # ... add batch ...
        db.commit()
    except Exception as e:
        db.rollback()
        log.error("[EventBatcher] flush failed, will retry: %s", e)
        raise  # Re-raise so retry logic catches it
    finally:
        db.close()
```
Add exponential backoff retry in `_periodic_flush`.

### C-10: Refresh Token Set — Unbounded Memory
**File:** `backend-cv/auth.py:42`
**Code:** `_used_refresh_tokens: set[str] = set()`
**Issue:** Grows without bound. No eviction. Process will OOM over time in production.
**Fix:**
```python
from collections import OrderedDict

class TTLCache(OrderedDict):
    def __init__(self, maxlen=10000):
        super().__init__()
        self.maxlen = maxlen

    def add(self, token: str, exp: float):
        self[token] = exp
        if len(self) > self.maxlen:
            self.popitem(last=False)

    def cleanup(self, now: float):
        expired = [k for k, v in self.items() if v < now]
        for k in expired:
            del self[k]
        return len(expired)

_used_refresh_tokens = TTLCache(maxlen=10000)
```

### C-11: WebSocket Binary Frame — No max_size Limit
**File:** `backend-cv/main.py:671,878...`
**Code:** `raw = await websocket.receive_text()` (no max_size)
**Issue:** No limit on WebSocket message size. Client can send multi-megabyte frames causing OOM.
**Fix:** Add `max_size` to all WebSocket receive calls.

### C-12: CSP wss://*: Wildcard WebSocket Origin
**File:** `frontend/index.html:6`
**Issue:** `connect-src 'self' ... wss://*:` — allows WebSocket connections to ANY server. An attacker XSS can exfiltrate data to any WebSocket endpoint.
**Fix:** Restrict to specific origins:
```html
connect-src 'self' ws://localhost:8000 wss://yourdomain.com
```

---

## 🟠 HIGH FINDINGS (18) — Fix Within First Sprint

### H-1: No Permissions-Policy for Camera/Mic
**File:** `frontend/index.html`
**Issue:** An interview platform with camera/mic access needs `Permissions-Policy` to prevent unauthorized sensor access by embedded third-party scripts.
**Fix:**
```html
<meta http-equiv="Permissions-Policy"
      content="camera=(self), microphone=(self), fullscreen=(self), display-capture=(self)">
```

### H-2: `docker-compose.yml` — JWT_SECRET Hardcoded Fallback
**File:** `docker-compose.yml:72`
**Code:** `JWT_SECRET=${JWT_SECRET:-dev-secret-change-in-production}`
**Fix:**
```yaml
JWT_SECRET: ${JWT_SECRET:?JWT_SECRET is required}
```

### H-3: Redis No Auth, Port Exposed
**File:** `docker-compose.yml:25-26`
**Fix:** Add password, bind to internal network only.

### H-4: Prometheus `/metrics` Unauthenticated
**File:** `backend-cv/main.py:1113-1116`
**Fix:**
```python
@app.get("/metrics", tags=["Monitoring"])
def metrics(user: dict = Depends(require_auth)):
    return metrics_endpoint()
```

### H-5: `X-Forwarded-For` Trusted Without Validation
**File:** `backend-cv/ratelimit.py:6-24`
**Issue:** Any client can spoof IP via `X-Forwarded-For` header, bypassing rate limits.
**Fix:** Use `ProxyHeadersMiddleware` or only trust from known proxies.

### H-6: `compute_integrity_score` Client Recalc Called After addRiskEvent
**File:** `frontend/src/useAegisStore.js:138`
**Code:** `get().updateIntegrityScore();`
**Issue:** Though `updateIntegrityScore()` is a no-op now, it creates a false sense of client-side score authority. Remove entirely.

### H-7: Silent Offline Mock Mode — No Visible Indicator
**File:** `backend-cv/main.py:79-81`, `agents/hub.py:504-510`
**Issue:** When no `OPENAI_API_KEY`, AI interviewer silently serves random canned responses from 4 options.
**Fix:**
```python
# On startup:
if not OPENAI_API_KEY and not os.getenv("AEGIS_DEV_MODE"):
    raise RuntimeError("OPENAI_API_KEY is required in production")
```
Add response header: `X-AI-Mode: offline_mock` or `X-AI-Mode: gpt-4o`

### H-8: `_compute_ear` Returns Hardcoded 0.3 on Degenerate Landmarks
**File:** `backend-cv/main.py:345-352`
**Code:** `return (A + B) / (2.0 * C) if C > 1e-6 else 0.3`
**Fix:** Return `None` and propagate — gate blink logic on valid EAR.

### H-9: Recruiter HITL Commands Have No Rate Limit
**File:** `backend-cv/main.py:1048`
**Fix:**
```python
recruiter_limiter = TokenBucketRateLimiter(rate=2.0, capacity=5)
# In ws_recruiter:
if not await recruiter_limiter.check_websocket(websocket):
    await websocket.send_json({"status": "error", "msg": "rate_limited"})
    continue
```

### H-10: `resetMandatoryLockdown` Erases Forensic Evidence
**File:** `frontend/src/useAegisStore.js:13`
**Code:** `resetMandatoryLockdown: () => set({ integrityScore: 100, riskEvents: [], ... })`
**Fix:** Never clear `riskEvents`. Add an `_appealOverride` flag instead of resetting integrity:
```javascript
appealOverride: () => set({
    strictMandatoryLockdown: false,
    mandatoryLockdownReason: '',
    _lockdownFired: false,
    _appealGranted: true,
    // Keep riskEvents intact
    // Keep integrityScore at its last value
}),
```

### H-11: CSRF Protection Missing on All Endpoints
**File:** `backend-cv/main.py` (all REST endpoints)
**Fix:** Implement CSRF middleware:
```python
from fastapi_csrf_protect import CsrfProtect

@CsrfProtect.load_config
class CsrfSettings:
    secret_key: str = os.getenv("CSRF_SECRET", "")
    cookie_samesite: str = "strict"

@app.post("/api/v1/auth/login")
async def login(csrf_protect: CsrfProtect = Depends()):
    csrf_protect.validate_csrf(request)
    # ...
```

### H-12: Gaze/Hand Sync Models Downloaded Without Hash Verification
**File:** `backend-cv/main.py:206-220`
**Issue:** MediaPipe models downloaded without SHA-256 verification. Man-in-the-middle could replace with malicious model.
**Fix:** Add hash verification. Already noted as TODO B-16.

### H-13: OpenTelemetry Tracing Configured But Never Used
**File:** `backend-cv/monitoring.py`
**Issue:** `setup_observability` configures OpenTelemetry exports, but no spans are created anywhere. Dead code.
**Fix:** Either instrument all WebSocket/API handlers with spans, or remove the configuration.

### H-14: Missing `Content-Type: application/json` Enforcement
**File:** `backend-cv/main.py` (auth endpoints)
**Fix:** Add middleware to reject non-JSON content types on POST/PUT endpoints:
```python
@app.middleware("http")
async def enforce_json_content_type(request: Request, call_next):
    if request.method in ("POST", "PUT", "PATCH"):
        ct = request.headers.get("content-type", "")
        if "application/json" not in ct:
            return JSONResponse(
                status_code=415,
                content={"error": "Content-Type must be application/json"}
            )
    return await call_next(request)
```

### H-15: Allowed Hosts Includes 0.0.0.0 — Host Header Injection
**File:** `backend-cv/.env:10`
**Fix:** Remove `0.0.0.0` from `ALLOWED_HOSTS`. Use specific hostnames only.

### H-16: alembic.ini Hardcoded to SQLite
**File:** `backend-cv/alembic.ini:89`
**Code:** `sqlalchemy.url = sqlite:///./aegis.db`
**Fix:**
```python
# In alembic/env.py
from app.config import settings
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
```

### H-17: StaticFiles Mount at `/` Shadows API Routes
**File:** `backend-cv/main.py:1354-1357`
**Code:** `app.mount("/", StaticFiles(...))`
**Issue:** SPA catch-all can silently swallow API route requests.
**Fix:**
```python
app.mount("/app", StaticFiles(directory=dist_path, html=True), name="static")

# At the bottom of main.py, add catch-all redirect:
@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    if full_path.startswith("api/") or full_path.startswith("ws/"):
        return JSONResponse({"error": "not_found"}, status_code=404)
    return FileResponse(os.path.join(dist_path, "index.html"))
```

### H-18: No Session ID Validation on Event Ingestion
**File:** `backend-cv/main.py` (hub association)
**Fix:** Add `validate_session_id` check before ALL event ingestion paths for defense-in-depth.

---

## 🟡 MEDIUM FINDINGS (22) — Fix Within First Month

### M-1: Duplicate Fusion Engines (4 implementations)
**Files:** `security_engine.py`, `fusion_engine.py`, `fusion_agent.py`, `fusion.py`
**Action:** Consolidate into single canonical `fusion_engine.py`. Remove others.

### M-2: Duplicate KS-Test Implementations (4 versions)
**Files:** `security_engine.py`, `forensic_engine.py`, `baseline_agent.py`, `ks_test.py`
**Action:** Consolidate into `ks_test.py`. Choose two-sample for gaze baseline, one-sample for distribution check.

### M-3: Strike Accumulation Without Decay
**File:** `backend-cv/protocol_engine.py`
**Issue:** Protocol 12-layer strike rule accumulates without time window. 3 LOW events over 2 hours triggers the same response as 3 in 5 seconds.
**Fix:**
```python
def evaluate_layer_6_strike_rule(self, now: float):
    window = 300.0  # 5-minute window
    recent = [v for v in self._violations if now - v[0] < window]
    return len(recent) >= 3, False
```

### M-4: No Per-Tool MCP Access Control
**Files:** `backend-cv/main.py:130-131`, `mcp/`
**Action:** Add role-based ACL:
```python
MCP_TOOL_ACL = {
    "sqlite": ["ADMIN"],
    "github": ["ADMIN"],
    "file_system": ["ADMIN"],
}
```

### M-5: Import `random` Inside Function Body
**Files:** `agents/hub.py:504`, `agents/security_engine.py:266,275`, `agents/forensic_engine.py:301`
**Action:** Move all imports to module level.

### M-6: `_get_client_ip` Returns "unknown" String — All Requests Map to Same Key
**File:** `backend-cv/ratelimit.py:24`
**Issue:** When IP undetermined, all unidentifiable clients share rate limit bucket.
**Fix:**
```python
return websocket.session_id if websocket else "unknown"
```

### M-7: `_history` Maxlen=50 Drops Context After 25 Turns
**File:** `backend-cv/agents/hub.py:101`
**Fix:**
```python
self._history: deque = deque(maxlen=200)
```

### M-8: `assess_minimum_requirements` on ID Data Can Crash on Missing Fields
**File:** `frontend/src/IdentityVerification.jsx`
**Action:** Add optional chaining and null checks.

### M-9: WebSocket Message Queue 100 Fixed — Should Scale by Session
**File:** `frontend/src/useWebSocket.js`
**Action:** Increase to 500 or make configurable based on expected frame rate.

### M-10: `FAIL_SECURE` Env Var Not Implemented
**File:** `backend-cv/main.py`
**Issue:** Plan references `FAIL_SECURE` env var to force `SKIP_AUTH=0` in production. Not implemented.
**Fix:**
```python
if os.getenv("FAIL_SECURE", "0") == "1":
    os.environ["SKIP_AUTH"] = "0"
```

### M-11: Scope Creep in `addRiskEvent` — Does Both Logging AND Disqualification
**File:** `frontend/src/useAegisStore.js:62`
**Issue:** Single function handles event logging, fusion processing, zero-tolerance checking, and phase transition.
**Fix:** Split into `logRiskEvent` (pure logging) and server-callback for verdict.

### M-12: `validate_session_id` No Input Type Guard
**File:** `backend-cv/main.py:609-611`
**Code:**
```python
def validate_session_id(session_id: str) -> bool:
    return bool(UUID_REGEX.match(session_id))
```
**Fix:**
```python
def validate_session_id(session_id: Any) -> bool:
    if not isinstance(session_id, str):
        return False
    return bool(UUID_REGEX.match(session_id))
```

### M-13: `auth_attempts` Unbounded Dict
**File:** `backend-cv/main.py:87-89`
**Fix:** Use LRU cache or periodic cleanup.

### M-14: `failed_login_attempts` + `lockout_threshold` Unbounded Dicts
**File:** `backend-cv/main.py:92-95`
**Fix:** Add TTL cleanup or use Redis.

### M-15: `content_json` Deserialized Without Schema Validation
**File:** `backend-cv/main.py:1313`
**Code:**
```python
"content": json.loads(a.content_json) if a.content_json else None,
```
**Fix:** Validate against Pydantic model per artifact_type before returning.

### M-16: No Guard Against `telemetry.pose?.yaw` Chaining
**Files:** Multiple frontend components
**Action:** Add safe defaults at store level, not at every render:
```javascript
// In useAegisStore.js
setTelemetry: (t) => set({
    telemetry: {
        gaze_anomaly: false, hands_visible: 0,
        pose: { pitch: 0, yaw: 0, roll: 0 },
        face_detected: false, status: 'ok',
        ...t,
        pose: { pitch: 0, yaw: 0, roll: 0, ...(t.pose || {}) },
    }
}),
```

### M-17: `useEffect` Cleanup Gap in PlrChallenge.jsx
**Action:** Ensure all `setInterval`/`requestAnimationFrame` handles are cleaned up.

### M-18: `_used_refresh_tokens` Set Operations Not Thread-Safe
**File:** `backend-cv/auth.py:42-50`
**Fix:**
```python
import threading
_refresh_lock = threading.Lock()

def consume_refresh_token(jti: str, exp: float) -> bool:
    with _refresh_lock:
        if jti in _used_refresh_tokens:
            return False
        _used_refresh_tokens.add(jti, exp)
        return True
```

### M-19: BCrypt Cost Not Explicitly Set
**File:** `backend-cv/auth.py:16`
**Code:** `pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")`
**Fix:**
```python
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
```

### M-20: Trivy Action Uses `@master` Branch
**File:** `.github/workflows/security-scan.yml:31`
**Fix:** Pin to specific hash or version tag.

### M-21: TruffleHog Uses `--only-verified`
**File:** `.github/workflows/ci.yml:70`
**Fix:** Remove `--only-verified` or add a second pass without it.

### M-22: `.env` Not in `.dockerignore`
**File:** `.dockerignore`
**Fix:** Add `**/.env` to `.dockerignore`.

---

## 🔵 LOW FINDINGS (15) — Fix As Time Permits

### L-1: Empty File `agents/integrity.py`
**Action:** Remove or implement.

### L-2: `version.py` `version_path` Traverses Outside Package
**File:** `backend-cv/version.py:9`
**Fix:** Use `importlib.metadata` or package-relative path.

### L-3: `content` from DB Artifact Not Sanitized
**File:** `backend-cv/main.py:1298-1315`
**Fix:** Add length limit per artifact type.

### L-4: `random` Not Seeded for Interview Mode
**File:** `frontend/src/InterviewerModeSelector.jsx:294`
**Action:** Use `crypto.getRandomValues()` where available.

### L-5: CSS Transition `all` Used Where Bounded Transitions Better
**File:** `frontend/src/*.jsx`
**Action:** Replace `transition: 'all 0.3s'` with specific property transitions.

### L-6: Missing `img` `alt` Attributes
**Action:** Audit and add `alt` text to all images.

### L-7: Shell-Form CMD in Dockerfile
**File:** `backend-cv/Dockerfile:38`
**Fix:**
```dockerfile
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### L-8: No `HEALTHCHECK` in Dockerfile
**Fix:**
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1
```

### L-9: CSP Missing `base-uri` Directive
**File:** `frontend/index.html:6`
**Fix:** Add `base-uri 'self';`

### L-10: CSP Missing `form-action` Directive
**Fix:** Add `form-action 'self';`

### L-11: No `Referrer-Policy` Header
**Fix:**
```python
referrer_policy = "strict-origin-when-cross-origin"
```

### L-12: Calendar Appointments Hardcoded to 2025
**Files:** Check date strings in calendar/demo code.
**Fix:** Use dynamic dates.

### L-13: `__aegisGazeEntropy` Window Global
**File:** `frontend/src/ScoreReport.jsx:144`
**Code:** `const metrics = typeof window !== 'undefined' && window.__aegisGazeEntropy ? ...`
**Issue:** Global namespace pollution. Could be set by attacker.
**Fix:** Pass via props or store.

### L-14: `@react-three/fiber` Canvas Renders Even When Hidden
**Fix:** Conditionally render 3D canvas only when visible.

### L-15: ScoreReport `useEffect` Depends on `animated` State — Causes Double Render
**Fix:**
```javascript
useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 300);
    return () => clearTimeout(t);
}, []);  // Remove dependency — run once on mount
```

---

## 🟣 PERFORMANCE FINDINGS (8)

### P-1: SQLite `check_same_thread=False` with Concurrent Async Writes
**Fix:** Use PostgreSQL in production. Add connection pool sizing.

### P-2: Default ThreadPool Executor Has No Size Limit
**File:** `backend-cv/main.py:608-610`
**Fix:**
```python
import concurrent.futures
cv_executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)
# Use cv_executor for _infer_frame calls
```

### P-3: `_prune_old` in Fusion Engine Iterates All Channels Every Evaluate
**Fix:** Throttle pruning to every N calls or use timestamp-based skip.

### P-4: SecurityDashboard Unbounded Animation Loop
**File:** `frontend/src/SecurityDashboard.jsx:575`
**Code:** `setInterval(() => setPos(p => (p + 1) % 100), 30)`
**Fix:** Reduce to 100ms or use CSS animations.

### P-5: N+1 Pattern in MemoryAgent DB Access
**File:** `backend-cv/agents/memory_agent.py`
**Fix:** Batch queries. Use eager loading.

### P-6: `_SANITIZED_PATHS` Cache Never Pruned
**File:** `backend-cv/monitoring.py:31-42`
**Fix:** Add LRU or TTL.

### P-7: Risk Events Filter `splice` O(n) Per Event
**File:** `frontend/src/useAegisStore.js:81-83`
**Fix:**
```javascript
if (newEvents.length > MAX_RISK_EVENTS) {
    newEvents.splice(0, newEvents.length - MAX_RISK_EVENTS);
}
```
This is already O(n) bounded by constant MAX. Acceptable.

### P-8: All WS Endpoints Share Single Event Loop Thread for CV
**Fix:** Run CV pipeline in a separate process or sub-interpreter.

---

## 🔷 ARCHITECTURE FINDINGS (7)

### A-1: AegisHub Is a God Object
**File:** `backend-cv/agents/hub.py`
**Issue:** 20+ instance variables, 15+ spoke agents, manages state + AI + DB + HITL.
**Fix:** Split into:
- `ConversationManager` — message history, ReAct loop
- `SecurityOrchestrator` — CV ingestion, fusion, fraud
- `SessionLifecycle` — DB, memory, cleanup

### A-2: Global Mutable State Per-Worker Only
**Files:** `backend-cv/main.py:87-113` (auth_attempts, failed_login_attempts, SESSION_HUBS, etc.)
**Issue:** All dictionaries are per-process. With multiple uvicorn workers, each worker has independent state.
**Fix:** Use Redis for cross-worker state sharing.

### A-3: Duplicate Agent Implementations (4 fusion, 4 KS-test)
**Files:** See M-1, M-2
**Action:** Consolidate into single canonical implementations.

### A-4: Inconsistent Error Response Format
**Issue:** Some endpoints return `{"error": "..."}`, others use `HTTPException(detail=...)`, others use `{"detail": "..."}`.
**Fix:** Create standard error response model:
```python
class APIError(BaseModel):
    error: str
    code: str
    detail: str | None = None
    request_id: str | None = None
```

### A-5: `Base.metadata.create_all` Runs at Import Time
**File:** `backend-cv/database.py:238`
**Issue:** Schema creation on import — when database.py is imported by ANY module.
**Fix:** Move `create_all` to a startup event or CLI command.

### A-6: WebSocket Auth Token Injected via JS (Browser Storage)
**File:** `frontend/src/useWebSocket.js:49`
**Issue:** Token read from cookie/localStorage in client-side JS. XSS can steal it.
**Fix:** Switch to httpOnly cookie + CSRF token pattern, or use a session-based WebSocket proxy.

### A-7: No Process Isolation Between Sessions
**Issue:** All sessions share the same Python process. One session's OOM or crash takes down all.
**Fix:** Consider per-session subprocess or container for production scale.

---

## 🧪 TEST COVERAGE GAPS

### T-1: Zero Auth Tests
### T-2: Zero Rate-Limit Tests
### T-3: Zero WebSocket Integration Tests
### T-4: Zero Security Engine Tests for Edge Cases
### T-5: `test_ks_test.py` Uses Relative `sys.path` Hack
### T-6: `test_protocol_engine.py` Mutates Global `os.environ` Without Cleanup
### T-7: Test Files Use Inconsistent Frameworks (unittest vs pytest)

---

## IMPLEMENTATION PLAN — 8-Week Sprint Schedule

### Week 1-2: 🔴 CRITICAL Security Hardening

| Day | Tasks |
|-----|-------|
| 1 | C-1: Root .gitignore, remove .env from git, rotate secrets |
| 2 | C-2: JWT_SECRET fail-hard; C-10: TTLCache for refresh tokens |
| 3 | C-3: Prompt injection guard (input filter + detection) |
| 4 | C-4: Move lockdown logic server-side; C-12: Fix CSP wss://* |
| 5 | C-5: Pydantic model for MCP invoke; C-7: Bias audit fail-deadly |
| 6 | C-6: Docker non-root; C-8: MediaPipe thread safety |
| 7 | C-9: EventBatcher retry + rollback fix; C-11: WS max_size |
| 8 | H-1: Permissions-Policy; H-2: docker-compose JWT; H-3: Redis |

### Week 3-4: 🟠 HIGH Production Readiness

| Day | Tasks |
|-----|-------|
| 1 | H-4: Metrics auth; H-5: Proxy trust for rate limit |
| 2 | H-6: Remove dead `updateIntegrityScore`; H-7: Mock mode indicator |
| 3 | H-8: EAR return None; H-9: Recruiter rate limit |
| 4 | H-10: Reset preserves riskEvents; H-11: CSRF middleware |
| 5 | H-12: Model hash verification; H-13: OTEL instrumentation |
| 6 | H-14: Content-Type enforcement; H-15: Remove 0.0.0.0 |
| 7 | H-16: Alembic dynamic URL; H-17: StaticFiles mount fix |
| 8 | H-18: Session ID validation on all paths |

### Week 5-6: 🟡 MEDIUM Consolidation

| Day | Tasks |
|-----|-------|
| 1 | M-1: Consolidate fusion engines → single canonical |
| 2 | M-2: Consolidate KS-test → single canonical |
| 3 | M-3: Strike rule decay window; M-4: MCP ACL |
| 4 | M-5: Move imports to module level; M-6: Rate limit fallback key |
| 5 | M-7: History maxlen 200; M-10: FAIL_SECURE env var |
| 6 | M-8 to M-18: All medium findings |
| 7 | M-19 to M-22: All medium findings |
| 8 | T-1 to T-7: Test coverage for auth, rate-limit, WS |

### Week 7-8: 🔵 LOW + 🔷 ARCHITECTURE Refinement

| Day | Tasks |
|-----|-------|
| 1 | All LOW findings (L-1 to L-15) |
| 2 | P-1 to P-8: All performance findings |
| 3 | A-1: Split AegisHub into 3 managers |
| 4 | A-2: Redis for cross-worker state |
| 5 | A-3: Consolidate duplicate agents |
| 6 | A-4: Standard error response format |
| 7 | A-5: Move create_all to startup; A-6: httpOnly cookie WS auth |
| 8 | A-7: Process isolation; final integration test pass |

---

## VERIFICATION CHECKLIST

Before each release:

```bash
# Backend
python -m ruff check .        # Lint
python -m pytest -x -q        # Tests
python -m pip audit           # Dependency security

# Frontend
cd frontend
npm run lint                  # Lint
npm test                      # Tests
npm audit                     # Dependency security
npm run build                 # Production build

# Infrastructure
docker compose config         # Validate compose
docker scout quick           # Container image scan (Docker Desktop)
```

### Security Regression Tests to Add

```python
# test_auth.py
def test_no_ephemeral_jwt_secret():
    """C-2: Server must fail to start without proper JWT_SECRET."""
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        # Run startup validation

def test_metrics_requires_auth():
    """H-4: /metrics endpoint must be authenticated."""
    response = client.get("/metrics")
    assert response.status_code == 401

def test_mcp_invoke_validates_body():
    """C-5: MCP invoke must reject unvalidated dict."""
    response = client.post("/api/v1/mcp/invoke", json={"tool": "; DROP TABLE"})
    assert response.status_code == 422

def test_lockdown_server_authoritative():
    """C-4: Client cannot independently trigger lockdown."""
    # Verify that addRiskEvent alone does NOT change phase
```

### Performance Benchmarks

| Metric | Target | Current |
|--------|--------|---------|
| WS connection latency | < 200ms | Unknown |
| CV inference per frame | < 100ms | Unknown |
| Integrity score calc | < 50ms | Unknown |
| Concurrent sessions | 100+ | Unknown |
| Memory per hub session | < 50MB | Unknown |
| Docker image size | < 500MB | Unknown |
