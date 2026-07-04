# AEGIS Implementation Plan — Full Audit Remediation

**Scope**: 39 issues across P0(10) + P1(14) + P2(8) + P3(7)
**Total files modified**: ~25
**Estimated effort**: 3-5 days full-time

---

## Phase 0: P0 — Critical Bugs (Do First)

### P0-1: Fix PLR White Screen Overlay (`PlrChallenge.jsx:258-286`)

**Problem**: `position:fixed` full-screen overlay (z-index 9000) blinds user for 6+ seconds.

**Fix**: Remove the white overlay div. Use a subtle flash effect on the screen border instead.

```diff
- {showStimulus && (
-   <div className="fixed inset-0 z-[9000] pointer-events-none">
-     <div className="absolute inset-0 bg-white transition-opacity duration-75" style={{ opacity: 0.95 }} />
-     <div className="absolute inset-0 bg-black transition-opacity duration-75" style={{ opacity: flashPhase ? 0 : 1 }} />
-   </div>
- )}

+ {showStimulus && (
+   <div className="fixed inset-0 z-10 pointer-events-none">
+     <div className="absolute inset-0 border-8 border-white/30 transition-all duration-75" />
+   </div>
+ )}
```

### P0-2: Fix Inverted PLR Logic (`PlrChallenge.jsx:211-213`)

**Problem**: `if (bright && delta > 0.4)` passes when face gets BRIGHTER. Real PLR: pupil constricts → face gets darker → `delta` should be NEGATIVE.

**Fix**: Invert the logic to check for DARKENING (constriction):

```diff
- const delta = lastBrightness - brightness;
- ...
- if (bright && delta > 0.4 && !constrictionDetected) {
-   constrictionDetected = true;
-   ...

+ const delta = brightness - lastBrightness; // positive = darkening
+ ...
+ if (bright && delta > 0.3 && !constrictionDetected) {
+   constrictionDetected = true;
+   ...
```

Also fix the `finalize` function to use the correct backend-compatible formula:

```diff
- const ratio = stimulusBrightness.length > 0
-   ? Math.min(...stimulusBrightness) / Math.max(...stimulusBrightness)
-   : 0;

+ // Use backend liveness_agent.py formula: (baseline - min) / baseline
+ const baseline = preStimulusBrightness;
+ const minBrightness = Math.min(...stimulusBrightness);
+ const constrictionRatio = baseline > 0 ? (baseline - minBrightness) / baseline : 0;
+ const plrPassed = constrictionRatio >= 0.08 && constrictionRatio <= 0.48;
```

### P0-3: Remove Fake Random Physics (`PlrChallenge.jsx:207-209`)

**Problem**: `Math.random()` values displayed as "real-time optical physics metrics" — misleading.

**Fix**: Replace with real computed values or remove entirely:

```diff
- <p>Optical Physics: {Math.random().toFixed(3)}</p>
- <p>Quantum Coherence: {Math.random().toFixed(3)}</p>
+ <p>Pupil Constriction: {constrictionRatio.toFixed(3)}</p>
+ <p>Confidence: {confidence.toFixed(3)}</p>
```

### P0-4: Add Skip Button for PLR (`LivenessChallenge.jsx`)

**Problem**: User stuck in infinite retry loop if PLR fails. No degraded-trust path.

**Fix**: Add skip button that emits a "degraded" trust event instead of failing:

```diff
+ // Add state  
+ const [showSkip, setShowSkip] = useState(false);
+ 
+ // Show skip button after 10 seconds of failure
+ useEffect(() => {
+   if (plrAttempts > 2) {
+     const t = setTimeout(() => setShowSkip(true), 5000);
+     return () => clearTimeout(t);
+   }
+ }, [plrAttempts]);
+ 
+ const handleSkipPlr = () => {
+   addEvent({ type: 'plr_skipped', severity: 'low', description: 'PLR skipped by user' });
+   setPlrComplete(true);
+   startInterview();
+ };

{/* In render, after PLR failure message */}
+ {showSkip && (
+   <button onClick={handleSkipPlr} className="px-4 py-2 bg-amber-600 text-white rounded">
+     Skip PLR (Degraded Trust Mode)
+   </button>
+ )}
```

### P0-5: Fix JWT_SECRET Validation (`auth.py:12`)

**Problem**: `SECRET_KEY = os.getenv("JWT_SECRET")` can be `None` — crashes at runtime.

**Fix**: Add startup validation:

```diff
- SECRET_KEY = os.getenv("JWT_SECRET")
- ALGORITHM = "HS256"
- ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
+ from pydantic import Field
+ from pydantic_settings import BaseSettings
+ 
+ class AuthSettings(BaseSettings):
+     JWT_SECRET: str = Field(min_length=32, description="JWT signing secret, min 32 chars")
+     JWT_ALGORITHM: str = "RS256"
+     ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
+ 
+ auth_settings = AuthSettings()
+ SECRET_KEY = auth_settings.JWT_SECRET
+ ALGORITHM = auth_settings.JWT_ALGORITHM
+ ACCESS_TOKEN_EXPIRE_MINUTES = auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES
```

### P0-6: Fix Hardcoded Passwords (`docker-compose.yml:8-10`)

**Problem**: `POSTGRES_PASSWORD: aegis_dev`, `GF_SECURITY_ADMIN_PASSWORD: admin`.

**Fix**: Use environment variable references with defaults and a startup override mechanism:

```diff
- POSTGRES_PASSWORD: aegis_dev
+ POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
```

### P0-7: Filter Event Severity for Lockout (`useAegisStore.js:113`)

**Problem**: `newEvents.length >= 3` counts ANY events including LOW severity ones.

**Fix**: Filter by severity:

```diff
- if (newEvents.length >= 3 && !strictMandatoryLockdown && !strictMode) {
+ const highSeverityEvents = newEvents.filter(e => e.severity === 'high' || e.severity === 'critical');
+ const mediumEvents = newEvents.filter(e => e.severity === 'medium');
+ if (
+   highSeverityEvents.length >= 1 ||
+   (mediumEvents.length >= 2) ||
+   (newEvents.length >= 5 && !strictMandatoryLockdown && !strictMode)
+ ) {
```

### P0-8: Fix 75% Threshold (`useAegisStore.js:148`)

**Problem**: `if (newScore < 75)` — too aggressive.

**Fix**: Lower threshold and add severity-weighted scoring:

```diff
- if (newScore < 75 && !strictMandatoryLockdown) {
+ if (newScore < 40 && !strictMandatoryLockdown) {
```

### P0-9: Fix Global Camera Stream Race Condition (`useAegisStore.js:283-298`)

**Problem**: `window.__aegisGlobalCameraStream` is global mutable state with race conditions.

**Fix**: Move to Zustand store with proper cleanup:

```diff
- window.__aegisGlobalCameraStream = stream;
+ set({ cameraStream: stream });

// And in cleanup:
- delete window.__aegisGlobalCameraStream;
+ const current = get().cameraStream;
+ if (current) { current.getTracks().forEach(t => t.stop()); }
+ set({ cameraStream: null });
```

### P0-10: Fix PLR Timer Race Condition (`PlrChallenge.jsx:225`)

**Problem**: `setTimeout` fires after unmount → double-set state.

**Fix**: Use ref guard:

```diff
+ const mountedRef = useRef(true);
+ useEffect(() => { return () => { mountedRef.current = false; }; }, []);

// In runCycle:
- timerRef.current = setTimeout(runCycle, sampleDelay);
+ if (mountedRef.current) {
+   timerRef.current = setTimeout(runCycle, sampleDelay);
+ }
```

---

## Phase 1: P1 — High Security & Architecture

### P1-1: Consolidate 4× KS-test → Single Module

**Create**: `backend-cv/agents/ks_test.py`

**Problem**: 4 duplicate implementations with different behavior.

**Fix**: Create single canonical KS-test module:

```python
"""ks_test.py — Single canonical KS-test implementation"""
import math
from typing import List, Tuple

def kolmogorov_smirnov_test(
    sample: List[float],
    baseline_mu: float = 0.0,
    baseline_sigma: float = 1.0,
) -> Tuple[float, float]:
    if not sample:
        return 0.0, 1.0
    n = len(sample)
    sample_sorted = sorted(sample)
    d_stat = 0.0
    for i, x in enumerate(sample_sorted):
        empirical_cdf = (i + 1) / n
        theoretical_cdf = 0.5 * (1 + math.erf((x - baseline_mu) / (baseline_sigma * math.sqrt(2))))
        d_stat = max(d_stat, abs(empirical_cdf - theoretical_cdf))
    # p-value approximation
    p_value = math.exp(-2 * d_stat * d_stat * n)
    return d_stat, p_value

def evaluate_baseline_divergence(
    current_features: List[float],
    baseline: List[float],
    threshold: float = 0.3,
) -> dict:
    if not baseline or not current_features:
        return {"ks_statistic": 0.0, "p_value": 1.0, "divergence_flagged": False}
    mu = sum(baseline) / len(baseline)
    sigma = math.sqrt(sum((x - mu)**2 for x in baseline) / len(baseline)) or 1.0
    d_stat, p_value = kolmogorov_smirnov_test(current_features, mu, sigma)
    return {
        "ks_statistic": round(d_stat, 4),
        "p_value": round(p_value, 4),
        "divergence_flagged": d_stat > threshold,
    }
```

Then remove duplicates from `security_engine.py`, `forensic_engine.py`, `baseline_agent.py`, `hub.py`.

### P1-2: Consolidate 3× Fusion → Single Canonical Engine

**Create**: `backend-cv/agents/fusion.py` — single canonical FusionEngine with one weight matrix. Use deterministic weights:

```python
CANONICAL_FUSION_WEIGHTS = {
    "gaze": 0.25,
    "baseline": 0.20,
    "kinematic": 0.15,
    "liveness": 0.25,
    "deepfake": 0.15,
}
```

Remove duplicate fusion logic from `security_engine.py`, `fusion_engine.py`, `fusion_agent.py`. Wire all consumers to the single canonical engine.

### P1-3: Add CSRF Protection (`main.py`)

```diff
+ from fastapi.middleware.trustedhost import TrustedHostMiddleware
+ from starlette.middleware.sessions import SessionMiddleware
+ 
+ app.add_middleware(
+     TrustedHostMiddleware,
+     allowed_hosts=os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(","),
+ )
```

### P1-4: Fix CSP Headers (`frontend/index.html:6`)

**Problem**: `'unsafe-inline'` + `'unsafe-eval'` makes CSP useless.

**Fix**: Set CSP via backend middleware instead (proper nonce-based):

```python
# In main.py
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "  # unsafe-inline needed for React
        "img-src 'self' data: blob:; "
        "connect-src 'self' ws: wss:; "
        "frame-src 'none'; "
        "object-src 'none'; "
        "base-uri 'self';"
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response
```

### P1-5: Fix Rate Limiter IP Spoofing (`ratelimit.py:36-37`)

```diff
- forwarded = request.headers.get("x-forwarded-for", "")
- ip = forwarded.split(",")[0].strip() or request.client.host
+ ip = request.client.host  # Use direct TCP connection IP, not X-Forwarded-For
+ # For proxy deployments, validate x-forwarded-for at load balancer level
```

### P1-6: Add WebSocket Auth Token Refresh (`useWebSocket.js:40-43`)

```diff
+ // Refresh token before expiry
+ const refreshIntervalRef = useRef(null);
+ 
+ useEffect(() => {
+   const REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 min before expiry
+   refreshIntervalRef.current = setInterval(async () => {
+     try {
+       const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
+       if (res.ok) {
+         const { access_token } = await res.json();
+         setToken(access_token);
+         // Reconnect WebSocket with new token
+         ws.close();
+         connectWebSocket(access_token);
+       }
+     } catch (e) {
+       console.error('Token refresh failed');
+     }
+   }, REFRESH_THRESHOLD_MS);
+   return () => clearInterval(refreshIntervalRef.current);
+ }, []);
```

### P1-7: Batch DB Writes (`hub.py:254-264` / `main.py:577-590`)

**Problem**: Synchronous `db.add()` + `db.commit()` per event (6-10/sec).

**Fix**: Implement event batching:

```python
# In hub.py
from collections import deque
import asyncio

class EventBatcher:
    def __init__(self, db_session_factory, flush_interval=1.0, batch_size=20):
        self.queue = deque()
        self.flush_interval = flush_interval
        self.batch_size = batch_size
        self.db_session_factory = db_session_factory
        self._task = None

    async def start(self):
        self._task = asyncio.create_task(self._flush_loop())

    async def add(self, event):
        self.queue.append(event)
        if len(self.queue) >= self.batch_size:
            await self._flush()

    async def _flush_loop(self):
        while True:
            await asyncio.sleep(self.flush_interval)
            if self.queue:
                await self._flush()

    async def _flush(self):
        db = self.db_session_factory()
        try:
            while self.queue:
                batch = [self.queue.popleft() for _ in range(min(self.batch_size, len(self.queue)))]
                db.add_all(batch)
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()
```

### P1-8: Add Graceful Shutdown (`main.py:108-109`)

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # Graceful shutdown
    logger.info("Shutting down...")
    for ws in active_connections.values():
        await ws.close(code=1001, reason="Server shutting down")
    await batcher.stop()  # from P1-7
    logger.info("All connections closed")
```

### P1-9: Forward Hub Events to Candidate WS (`hub.py:146-156`)

```diff
- await manager.send_to_recruiter(session_id, payload)
+ await manager.send_to_recruiter(session_id, payload)
+ # Also send to candidate for transparency
+ await manager.send_to_candidate(session_id, {
+     "type": "integrity_update",
+     "data": payload
+ })
```

### P1-10: Migrate HS256 → RS256 (auth.py)

```python
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend

# Generate key pair on startup
_private_key = rsa.generate_private_key(
    public_exponent=65537,
    key_size=2048,
    backend=default_backend()
)
PRIVATE_KEY = _private_key.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    no_encryption=serialization.NoEncryption()
)
PUBLIC_KEY = _private_key.public_key().public_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PublicFormat.SubjectPublicKeyInfo
)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(tz=UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, PRIVATE_KEY, algorithm="RS256")

def decode_access_token(token: str):
    return jwt.decode(token, PUBLIC_KEY, algorithms=["RS256"])
```

### P1-11: Fix Alembic Migration (empty upgrade/downgrade)

**Problem**: Initial migration has `pass` for both `upgrade()` and `downgrade()`.

**Fix**: Regenerate migration with actual schema from `database.py` models.

### P1-12: Wire Dead Code Agents or Remove Them

**Problem**: 7 agent modules (655 lines) are instantiated nowhere.

**Decision**: Either:
- Wire `deepfake_agent.py`, `kinematic_agent.py`, `liveness_agent.py` into the fusion pipeline in `hub.py`
- Or remove them and document as "archived prototypes"

### P1-13: Fix Vite Proxy (`vite.config.ts`)

```diff
  server: {
    proxy: {
      '/ws': {
-       target: 'ws://localhost:8000',
+       target: process.env.VITE_API_URL || 'ws://localhost:8000',
        ws: true,
      },
      '/api': {
-       target: 'http://localhost:8000',
+       target: process.env.VITE_API_URL?.replace(/^ws/, 'http') || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
```

### P1-14: Pin requirements.txt Versions

```diff
- fastapi
- uvicorn[standard]
+ fastapi>=0.115.0,<1.0.0
+ uvicorn[standard]>=0.32.0,<1.0.0
# Pin all dependencies to known-working versions
```

---

## Phase 2: P2 — Medium (Performance, UX, Reliability)

### P2-1: Increase JPEG Quality (`InterviewArena.jsx:367`)

```diff
- const blob = await canvasRef.current.toBlob('image/jpeg', 0.45);
+ const blob = await canvasRef.current.toBlob('image/jpeg', 0.80);
```

### P2-2: Nuclear Lockdown Accessibility (`useNuclearLockdown.js`)

- Remove `document.documentElement.requestFullscreen()` hijack
- Replace `document.addEventListener('copy', e => e.preventDefault())` with gentle warning
- Keep storage/window monitoring but add ARIA labels

### P2-3: Add ErrorBoundary

Create `frontend/src/ErrorBoundary.jsx`:

```jsx
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('App crashed:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
            <p className="mb-4 text-gray-400">We've logged this and will investigate.</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 bg-indigo-600 rounded">
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

Wrap in `App.jsx`:

```diff
+ import ErrorBoundary from './ErrorBoundary';
  // ...
- <Router>
+ <ErrorBoundary>
+   <Router>
      {/* routes */}
+   </Router>
+ </ErrorBoundary>
```

### P2-4: Fix Invalid Sensor Noise Heuristic (`LivenessChallenge.jsx:128-133`)

```diff
- if (variance < 0.001) { liveness_fail = true; }
+ // Remove this check entirely — stable lighting is valid.
+ // Low variance does not equal synthetic video.
```

### P2-5: Add UUID Validation (`main.py:964-968`)

```python
import uuid

def validate_session_id(session_id: str) -> bool:
    try:
        uuid.UUID(session_id)
        return True
    except ValueError:
        return False

# In endpoint handler:
if not validate_session_id(session_id):
    return JSONResponse(
        status_code=400,
        content={"detail": "Invalid session_id format"},
    )
```

### P2-6: Increase Tab-Switch Threshold (`useDigitalSecurity.js:41-43`)

```diff
- const TAB_SWITCH_THRESHOLD = 2;
+ const TAB_SWITCH_THRESHOLD = 5;
```

### P2-7: Increase Paste Detection Threshold (`useDigitalSecurity.js:82-85`)

```diff
- if (text.length > 80) {
+ if (text.length > 200) {
```

### P2-8: Tag OTel Spans with Session ID (`monitoring.py`)

```python
from opentelemetry import trace
tracer = trace.get_tracer(__name__)

def trace_with_session(session_id: str):
    span = tracer.start_span("session_operation")
    span.set_attribute("session.id", session_id)
    return span
```

---

## Phase 3: P3 — Low (Polish, Maintenance)

### P3-1: Singleton Version String

Create `frontend/src/version.js` and `backend-cv/version.py` sourced from a single source:
- `frontend/package.json` → `"version": "3.1.0"`
- `backend-cv/version.py` → `VERSION = "3.1.0"`

### P3-2: Add Test Suite

**Minimum coverage**:
- `pytest` for all agent modules (KS-test, fusion, liveness, kinematic, deepfake)
- `vitest` for Zustand store + hooks
- `playwright` for critical user flows (PLR skip, camera stream, WS reconnect)

### P3-3: Fix Empty KNOWN_SOLUTIONS_HASHES (`code_review_agent.py:22`)

```python
KNOWN_SOLUTIONS_HASHES = set()  # TODO: Populate from solution database
```

Either wire to a real solution DB or add a startup validation that warns if empty.

### P3-4: Enable TypeScript Checking (`tsconfig.json`)

```diff
- "allowJs": true,
- "checkJs": false,
+ "allowJs": false,
+ "checkJs": false,  // Remove when all .jsx → .tsx migration is done
```

And rename `useAegisStore.js` → `useAegisStore.ts` with proper types.

### P3-5: Add ESLint TypeScript Rules (`eslint.config.js`)

```diff
- files: ['**/*.{js,jsx}'],
+ files: ['**/*.{js,jsx,ts,tsx}'],
```

Add `typescript-eslint` plugin.

### P3-6: Remove chronos_engine.py / omega_engine.py

Either implement proper engine logic or remove dead placeholder files.

### P3-7: Fix Deprecated `datetime.utcnow()`

```diff
- expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
+ from datetime import timezone
+ expire = datetime.now(tz=timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
```

---

## Implementation Order Summary

| Phase | Items | Rationale |
|-------|-------|-----------|
| **Phase 0** | P0-1 through P0-10 | Critical bugs — app-breaking, fix first |
| **Phase 1** | P1-1 through P1-14 | Security & architecture — must fix before production |
| **Phase 2** | P2-1 through P2-8 | UX & reliability — important for user trust |
| **Phase 3** | P3-1 through P3-7 | Polish — do last, but before shipping to prod |

---

## Rollout Checklist

- [ ] Verify PLR test passes without blinding user (P0-1)
- [ ] Verify PLR test correctly detects pupil constriction (P0-2)
- [ ] Verify skip button appears after 10s of PLR failure (P0-4)
- [ ] Verify JWT_SECRET validation crashes at startup (P0-5)
- [ ] Verify 1 HIGH or 2 MEDIUM events trigger lockdown but 3 LOW do not (P0-7)
- [ ] Run `pytest` — all agent tests pass (P3-2)
- [ ] Run `npm run build` — no errors (P3-4)
- [ ] Run `docker-compose up` — no hardcoded passwords (P0-6)
- [ ] Run `python -c "from agents.fusion import FusionEngine; print('OK')"` — single fusion path (P1-2)
- [ ] Run `python -c "from agents.ks_test import evaluate_baseline_divergence; print('OK')"` — single KS-test (P1-1)
