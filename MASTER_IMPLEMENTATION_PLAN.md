# Aegis Interview Platform — Master Implementation Plan v3.0

> **Source:** 3 research papers (9,648 + 7,323 + 5,559 words) + 9 spec docs + production audit (82 findings) + deep web research (80+ sources) + full codebase audit (25 agents)
> **Author:** Tushar Kapoor | AEGIS Research Institute v3.0 | June 2026
> **The 5 Unsolved Problems** (from AEGIS Paper §10): whitespace fixation detection, KS-test per-candidate gaze baseline, combined PLR+rPPG liveness, cross-dataset deepfake generalization, five-channel behavioral fusion with N>=3

---

## The 5 Unsolved Problems — Direct from AEGIS Paper §10

### Problem 1: Compositor-Level Overlay Detection (§10.1)
**Paper says:** "Cluely renders below WebRTC capture layer at OS compositor level. The ONLY indirect signal is whitespace fixation — candidates using overlays fixate on UI whitespace where no content exists."
**Codebase gap:** `WhitespaceFixationDetector` in `forensic_engine.py` exists but is DEAD CODE — never imported, never called.
**Fix:** Wire whitespace fixation into `hub.py` ingestion pipeline, add overlay-tool-specific screen-edge clustering (bottom-right margin where Cluely renders text), add lag loop detection (consistent 2-4s delay regardless of question difficulty).

### Problem 2: Per-Candidate Statistical Gaze Modeling (§10.2)
**Paper says:** "Every commercial system uses universal thresholds (angle > 25° for 3 frames). KS-test per-candidate baseline deviation is the upgrade — build gaze distribution in first 90 seconds, flag only when p < 0.05. Zero published implementations exist."
**Codebase gap:** `baseline_agent.py` has KS-test implementation but it's NOT FED INTO `gaze_agent.py`. The gaze agent still uses hardcoded `violation_ratio_threshold=0.25`.
**Fix:** Wire `baseline_agent.py` enrollment output into `gaze_agent.py` as `enrollment_x/enrollment_y` parameters. Replace universal thresholds with KS-statistic-based adaptive thresholds.

### Problem 3: Combined PLR + rPPG Single Liveness Check (§10.3)
**Paper says:** "Commercial systems use PLR OR rPPG, never both in a single check. No published paper demonstrates this combination in a single RGB webcam check. Theoretical: >99.5% combined."
**Codebase gap:** `liveness_agent.py` has PLR+rPPG fusion but `PLRrPPGLivenessEngine` in `forensic_engine.py` uses `frame_brightness` (webcam ambient brightness) not `stimulus_brightness` (screen flash). Frontend `PlrChallenge.jsx` (433 lines) is DEAD CODE — never imported.
**Fix:** Frontend sends `stimulus_brightness` with every frame during PLR challenge. Backend accepts it. Wire `PlrChallenge.jsx` into interview flow. Add anticipation detection (constriction before stimulus = video replay) and motion artifact rejection for rPPG.

### Problem 4: Cross-Dataset Deepfake Generalization (§10.4)
**Paper says:** "CAST drops from 99.49% (FF++) to 74.92% (Celeb-DF). The 25-point generalization gap means new deepfake styles evade current detectors. Challenge-response (Gotcha) is the primary alternative."
**Codebase gap:** `deepfake_agent.py` uses purely heuristic lip-sync correlation. `ChallengeResponseDeepfake.jsx` is DEAD CODE. No GenD model integration. No challenge-response in live flow.
**Fix:** Activate challenge-response (Gotcha-style: rapid head turns, hand-over-face, lighting changes, simultaneous speech+movement). Add GenD integration path (server-side PyTorch or ONNX Runtime Web). Lip-sync remains secondary signal.

### Problem 5: Five-Channel Behavioral Consistency Fusion (§10.5)
**Paper says:** "Individual channels have 15-25% false negative rates. Fusion with N>=3 concurrent channel deviations is described in academic literature but NOT implemented in any open-source pipeline."
**Codebase gap:** 4 DUPLICATE fusion engines (`security_engine.py`, `fusion_engine.py`, `fusion_agent.py`, `fusion.py`). All use weighted average only — no N>=3 rule, no temporal accumulation.
**Fix:** Consolidate into single `fusion_engine.py`. Add N>=3 rule (at least 3 of 5 channels must independently exceed threshold before session-level alert). Add temporal accumulation across sliding windows. Add ViProctor-Transformer integration path.

---

## Threat Model — 6 Cheating Layers (from AEGIS Paper §3)

| Layer | Threat | Detection Signal | Current Status | Paper § Reference |
|-------|--------|-----------------|----------------|-------------------|
| 1 | Invisible overlays (Cluely) | Whitespace fixation, lag loop | Detector exists but DEAD CODE | §3.2 |
| 2 | Deepfake video/voice | Challenge-response, PLR+rPPG, lip-sync | Challenge-response DEAD CODE, no GenD | §3.3 |
| 3 | Proxy networks + KVM | Multi-person, keystroke mismatch, IP geo | Partial (multi-person in kinematic_agent) | §3.4 |
| 4 | Virtual machines | CPUID/registry scanning | NOT IMPLEMENTED | §3.5 |
| 5 | Secondary devices + wearables | Gaze deviation, whitespace, shoulder drop | Partial (gaze_agent) | §3.5 |
| 6 | GenAI answer injection | Response latency (flatline), vocabulary jump | NOT IMPLEMENTED | §3.7 |

---

## Implementation Roadmap — 12 Weeks / 6 Phases

### Phase 0: Wire Dead Code & Fix Critical Security (Week 1-2)
**Paper alignment:** Addresses all 5 Unsolved Problems at the plumbing level — none of the detectors work because they're not wired.

| ID | Task | Paper Gap | Files | Effort |
|----|------|-----------|-------|--------|
| 0.1 | Wire `ingest_security_features()` in hub.py | Gaps 1-5 all blocked by this | `hub.py:208-266`, `main.py:645` | 0.5d |
| 0.2 | Activate `WhitespaceFixationDetector` with dynamic UI zones | Gap 1 | `forensic_engine.py`, `gaze_agent.py` | 1d |
| 0.3 | Fix PLR stimulus_brightness pipeline (frame_brightness → stimulus_brightness) | Gap 3 | `main.py:517`, `forensic_engine.py:270-275` | 1d |
| 0.4 | Activate `ChallengeResponseDeepfake.jsx` in InterviewArena | Gap 4 | `ChallengeResponseDeepfake.jsx`, `InterviewArena.jsx` | 0.5d |
| 0.5 | Wire `PlrChallenge.jsx` into liveness flow | Gap 3 | `PlrChallenge.jsx`, `LivenessChallenge.jsx` | 0.5d |
| 0.6 | S-1: WebSocket accept-before-auth (close 4003) | — | `main.py:591,739,917` | 0.5d |
| 0.7 | S-2: JWT fail-hard (no ephemeral fallback) | — | `auth.py:19-22` | 0.25d |
| 0.8 | S-3: JWT in WebSocket Sec-WebSocket-Protocol header | — | `auth.py:80` | 0.25d |
| 0.9 | S-4: `require_session_access()` on ALL report endpoints | — | `main.py:1094-1150` | 0.5d |
| 0.10 | S-5 to S-10: Auth validation, origin check, CSP fix | — | Various | 1d |
| 0.11 | C-1: `.env` gitignored, C-2: JWT_SECRET required, C-3: Prompt injection guard | — | Root, `auth.py`, `main.py:946` | 0.5d |
| 0.12 | C-4: Move lockdown logic server-side (ZERO client authority) | — | `useAegisStore.js:62-138` | 1d |
| 0.13 | C-5 through C-12: MCP validation, Docker non-root, thread safety, DB leak, TTL cache, WS max_size, CSP restrict | — | Various | 1.5d |

**Deliverable:** All 12 critical security fixes applied. All 5 dead-code components wired. PLR pipeline corrected. Challenge-response active.

### Phase 1: Fix Agent Implementations (Week 3-4)
**Paper alignment:** Direct code fixes for the agent implementations of Gaps 1-5.

| ID | Task | Paper Gap | Files | Effort |
|----|------|-----------|-------|--------|
| 1.1 | `gaze_agent.py` — add KS-test enrollment feeding, lag loop detection, screen-edge overlay clustering | Gap 1, Gap 2 | `gaze_agent.py` | 1d |
| 1.2 | `liveness_agent.py` — add anticipation detection (constriction before stimulus = replay), motion artifact rejection, skin tone-aware SNR, randomized timing | Gap 3 | `liveness_agent.py` | 1d |
| 1.3 | `deepfake_agent.py` — add GenD integration path (server-side gend_score / client-side clip_embedding), challenge-response interface | Gap 4 | `deepfake_agent.py` | 0.5d |
| 1.4 | `fusion_agent.py` — add N>=3 rule, temporal accumulation across windows, ViProctor-Transformer stub | Gap 5 | `fusion_agent.py` | 0.5d |
| 1.5 | `baseline_agent.py` — add `assess_enrollment_quality()`, adaptive D-threshold, feed into gaze agent | Gap 2 | `baseline_agent.py` | 0.5d |
| 1.6 | `ks_test.py` — consolidate to two-sample KS (matches baseline_agent), remove duplicate one-sample | M-2 | `ks_test.py` | 0.25d |
| 1.7 | `fraud_agent.py` — add WHITESPACE_FIXATION, BEHAVIORAL_INCONSISTENCY, PLR_FAILURE, LAG_LOOP, CHALLENGE_RESPONSE_FAIL, OVERLAY_CLUSTER signal types | Gap 1,3,4,5 | `fraud_agent.py` | 0.25d |
| 1.8 | Fix MediaPipe lip indices (13/14 for 478-point model, not dlib 68-point) | R-1 | `main.py:544-549` | 0.25d |
| 1.9 | Fix KS-test 2-element sample (buffer x/y separately) | R-2 | `hub.py:228-237` | 0.25d |

**Deliverable:** All 25 agents corrected per research paper findings. 4 duplicate fusion engines consolidated. 4 duplicate KS implementations consolidated. New signal types active.

### Phase 2: Multi-Agent Orchestration & Calibration (Week 5-6)
**Paper alignment:** Paper §5.6 (KS-test calibration), §11.4 (5-channel fusion), §6 (gesture + gaze fusion).

| ID | Task | Paper § | Files | Effort |
|----|-------|---------|-------|--------|
| 2.1 | 90-second calibration phase UI + backend: build enrollment gaze distribution, store in session | §5.6 | New calibration component + `hub.py` + `session_store` | 1.5d |
| 2.2 | Wire KS-test baseline into fusion engine: gaze_risk now uses KS-statistic not hard threshold | §11.2 | `gaze_agent.py` → `hub.py` → `fusion_agent.py` | 1d |
| 2.3 | Wire whitespace fixation signal into fusion engine as 6th track | §11.1 | `gaze_agent.py` whitespace output → `fusion_agent.py` | 0.5d |
| 2.4 | Wire PLR+rPPG liveness verdict into fusion engine | §11.3 | `liveness_agent.py` → `fusion_agent.py` | 0.5d |
| 2.5 | Add N>=3 fusion rule with severity escalation (N=2 log, N=3 yellow, N=4 amber+HITL, N=5 red+session pause) | §11.4 | `fusion_agent.py` | 0.5d |
| 2.6 | Add accommodation mode: disable gaze/micro-expression tracking for medical conditions, fall back to identity + environment scan | Paper 1 §Accommodation | Store config + tracking disable in hub | 1d |
| 2.7 | Ghost View prototype: SVG skeletal wireframe + gaze vectors overlay on recruiter video player | Paper 3 §Ghost View | `CommandCenter.jsx` + WebSocket relay | 1.5d |
| 2.8 | 10-vector security firewall: activate ALL vectors including CSS injection scan (Vector 6) and timing attack (Vector 5) | Spec §3 | `useDigitalSecurity.js` | 1d |

**Deliverable:** End-to-end wired pipeline: camera → agent evaluators → fusion engine → integrity score → recruiter dashboard.

### Phase 3: Frontend Architecture Rewrite (Week 7-8)
**Paper alignment:** Paper §4 (asymmetric information principle), §UI/UX (minimal candidate, maximal recruiter).

| ID | Task | Paper § | Files | Effort |
|----|-------|---------|-------|--------|
| 3.1 | WebSocket with exponential backoff reconnection: MAX_RETRIES=10, BASE_DELAY=1s, MAX_DELAY=30s, real queue drain to ws.send() | — | `useWebSocket.js` REWRITE | 1d |
| 3.2 | Reactive store selectors: `useIntegrityScore`, `usePhase`, `useMessages` (fix `getState()` in JSX) | — | `useAegisStore.js` | 0.5d |
| 3.3 | PlrChallenge integration: Step 1 = gaze calibration, Step 2 = PLR flash, Step 3 = Gotcha, Step 4 = complete | §11.3 | `LivenessChallenge.jsx` rewrite | 1d |
| 3.4 | Fix all React 19 violations: 7 ref-mutation hooks, 5 setState-in-useEffect, 3 impure render calls | — | Multiple frontend files | 1d |
| 3.5 | Command Center timeline: scrubable multi-layer timeline with gaze heatmap, head pose, audio anomalies | §5.2 Ghost View | `CommandCenter.jsx` rewrite | 1.5d |
| 3.6 | HITL audit trail: persist all TERMINATE/WARN/FLAG decisions to DB with recruiter identity, timestamp, correlation ID | — | `hub.py` + DB migration | 0.5d |
| 3.7 | Fix current code: `process.env` → `import.meta.env` (Vite 8), ESLint TypeScript parser, `typing` import, `JSONResponse` import | — | Multiple | 0.5d |

**Deliverable:** Stable frontend with proper WebSocket reconnection, reactive state, working liveness flow, recruiter Command Center with Ghost View.

### Phase 4: Deepfake & Anti-Spoofing Hardening (Week 9-10)
**Paper alignment:** Paper §7 (CAST, challenge-response, rPPG+PLR), deep research v2 §2 (GenD WACV 2026).

| ID | Task | Paper § | Files | Effort |
|----|-------|---------|-------|--------|
| 4.1 | GenD model deployment: server-side PyTorch inference endpoint at `/api/v1/gend/infer` | §7.1, GenD WACV 2026 | New `gend_service.py` + `main.py` route | 2d |
| 4.2 | ONNX Runtime Web integration: client-side GenD inference via ONNX WebGPU execution provider | §7.1 | Frontend ONNX integration | 2d |
| 4.3 | Challenge-response library expansion: add random number repetition, smile+frown, blink-twice, raise-left-hand challenges | §7.3 | `ChallengeResponseDeepfake.jsx` | 1d |
| 4.4 | Lip-sync MAR improvement: use correct 478-point MediaPipe lip landmarks, verify against LIPINC-V2 thresholds | §7.2 | `deepfake_agent.py` | 0.5d |
| 4.5 | rPPG spoofing detection: check for ChatPPG-style synthetic heartbeat injection (spectral flatness, phase coherence) | §7.4 | `liveness_agent.py` | 1d |
| 4.6 | Cross-dataset evaluation: test deepfake model on FF++, Celeb-DF, DFDC, DFD — document generalization gap | §7.1 | Test script + report | 1d |

**Deliverable:** Production deepfake pipeline with GenD model, expanded challenge-response library, rPPG spoofing countermeasures.

### Phase 5: EU AI Act & Bias Compliance (Week 11)
**Paper alignment:** Paper §12 (8 global frameworks), deep research v2 §5 (EU AI Act Aug 2026).

| ID | Task | Regulation | Files | Effort |
|----|-------|-----------|-------|--------|
| 5.1 | FRIA (Fundamental Rights Impact Assessment) documentation | EU AI Act Art. 27 | New `compliance/FRIA.md` | 1d |
| 5.2 | Bias audit: test all CV models across diverse demographics, document FPR/FNR per group | NYC Law 144, EU AI Act | `bias_agent.py` production + audit script | 2d |
| 5.3 | Remove ALL emotion/personality scoring from biometric pipelines | EU AI Act Art. 5(1)(f) | Audit all agents for emotion-related code | 0.5d |
| 5.4 | Candidate transparency notice: disclose AI monitoring scope, data retention, right to appeal | GDPR Art. 13-14, NYC Law 144 | New frontend component | 0.5d |
| 5.5 | Human oversight mechanism: HITL mandatory for any integrity score below threshold | EU AI Act Art. 14 | `hub.py` HITL escalation | 0.5d |
| 5.6 | Data minimization: verify raw biometric data NEVER leaves device, only anonymized telemetry | GDPR Art. 5(1)(c), BIPA | Code audit + fix | 0.5d |
| 5.7 | 90-day auto-purge cron job for raw video + high-freq telemetry | GDPR storage limitation | AWS Lambda + cleanup script | 0.5d |

**Deliverable:** EU AI Act compliant system (high-risk rules active Aug 2026). Bias audit report. FRIA documented. Transparency notice deployed.

### Phase 6: Infrastructure, Testing & Launch (Week 12)
**Paper alignment:** Paper §14 (implementation roadmap, Phase 4-5), production audit findings.

| ID | Task | Source | Files | Effort |
|----|-------|--------|-------|--------|
| 6.1 | Comprehensive test suite: auth (10), rate-limit (6), WebSocket (8), forensic engine (8), E2E (4), MCP (4) | Audit T-1..T-7 | `tests/` | 2d |
| 6.2 | Docker hardening: non-root USER 1000, health checks, remove 0.0.0.0, dev requirements split | C-6, H-2, H-15 | `Dockerfile`, `docker-compose.yml` | 0.5d |
| 6.3 | CI/CD pipeline: ruff check → pytest → pip-audit (backend), lint → test → build (frontend), trufflehog + trivy (security) | — | `.github/workflows/ci.yml` | 0.5d |
| 6.4 | Redis TLS + password, PostgreSQL connection pooling, Alembic migrations | H-3, P-1 | `docker-compose.yml`, `alembic/` | 0.5d |
| 6.5 | P-1: SQLite → PostgreSQL migration for production, connection pool sizing | P-1 | `database.py`, `alembic/` | 1d |
| 6.6 | P-2: ThreadPoolExecutor max_workers=4 for CV inference | P-2 | `main.py:608-610` | 0.25d |
| 6.7 | Invitation-based session start: CSPRNG token, hash in DB, no auth for candidate entry | — | `main.py` + new flow | 0.5d |
| 6.8 | Frame skipping: target 10 FPS processing with `FrameSkipper` class | — | New utility + integrate | 0.5d |
| 6.9 | Dynamic MediaPipe pool sizing: max(2, min(cpu_count*2, memory_gb/0.4, 16)) | — | `main.py:254-259` | 0.25d |
| 6.10 | Post-interview PDF report: integrity score, risk breakdown, event timeline | — | New `report_generator.py` | 1d |

**Deliverable:** Production-ready infrastructure with CI/CD, comprehensive tests, Docker hardening, PostgreSQL migration.

---

## File Change Inventory (Complete)

### Backend: Python (21 files)
| File | Phase | Change |
|------|-------|--------|
| `backend-cv/main.py` | 0,1,4,6 | Security fixes (S-1..S-10), PLR/stimulus fix, WS wiring, GenD endpoint, pool sizing, frame skipping, invitation flow |
| `backend-cv/auth.py` | 0 | JWT fail-hard, TTLCache, WS auth via protocol header |
| `backend-cv/agents/hub.py` | 0,1,2 | Wire security pipeline, KS-test fix with enrollment buffer, HITL escalation, parallel agent dispatch |
| `backend-cv/agents/gaze_agent.py` | 1 | KS-test enrollment feeding, lag loop detection, screen-edge overlay clustering, PLR latency check |
| `backend-cv/agents/liveness_agent.py` | 1 | Anticipation detection, motion artifact rejection, skin tone adjustment, randomized timing |
| `backend-cv/agents/deepfake_agent.py` | 1 | GenD integration path (gend_score/clip_embedding), challenge-response interface |
| `backend-cv/agents/fusion_agent.py` | 1 | N>=3 rule, temporal accumulation, ViProctor-Transformer stub |
| `backend-cv/agents/baseline_agent.py` | 1 | `assess_enrollment_quality()`, adaptive D-threshold, output feeds gaze agent |
| `backend-cv/agents/fraud_agent.py` | 1 | 6 new signal types (WHITESPACE_FIXATION, BEHAVIORAL_INCONSISTENCY, PLR_FAILURE, LAG_LOOP, CHALLENGE_RESPONSE_FAIL, OVERLAY_CLUSTER) |
| `backend-cv/agents/ks_test.py` | 1 | Consolidated to two-sample KS (was one-sample), remove duplicate |
| `backend-cv/agents/__init__.py` | 1 | Updated exports |
| `backend-cv/agents/forensic_engine.py` | 0 | PLR stimulus_brightness fix, kinematic hardening |
| `backend-cv/agents/security_engine.py` | 1 | Fusion rewrite (windowed, N>=3) |
| `backend-cv/agents/bias_agent.py` | 0 | Fail-deadly on audit error (was fail-safe) |
| `backend-cv/agents/circuit_breaker.py` | 2 | Circuit breaker pattern for agent dispatch |
| `backend-cv/cache.py` | 0,6 | `ensure_connected()`, Redis TLS |
| `backend-cv/event_batcher.py` | 0 | Retry + rollback fix (C-9) |
| `backend-cv/database.py` | 6 | Move `create_all` to startup event (A-5), PostgreSQL config |
| `backend-cv/monitoring.py` | 0 | OTEL instrumentation or removal (H-13) |
| `backend-cv/report_generator.py` | 6 | CREATE — PDF report generator |
| `backend-cv/gend_service.py` | 4 | CREATE — GenD PyTorch inference endpoint |

### Frontend: JavaScript/React (14 files)
| File | Phase | Change |
|------|-------|--------|
| `frontend/src/useWebSocket.js` | 3 | REWRITE — exponential backoff, real queue drain to ws.send() |
| `frontend/src/useAegisStore.js` | 0,3 | Remove client lockdown authority, reactive selectors |
| `frontend/src/LivenessChallenge.jsx` | 0,1,3 | Wire to backend, integrate PlrChallenge (gaze→PLR→Gotcha→done) |
| `frontend/src/PlrChallenge.jsx` | 0 | Activate dead code, send stimulus_brightness with frames |
| `frontend/src/ChallengeResponseDeepfake.jsx` | 0,4 | Activate dead code, expand challenge library |
| `frontend/src/InterviewArena.jsx` | 0,3 | v4_liveness handling, event name fix |
| `frontend/src/useDigitalSecurity.js` | 2 | Add Vector 6 (CSS injection scan), Vector 5 (timing attack) |
| `frontend/src/useResponseTiming.js` | 0 | Fix event name mismatch (R-10) |
| `frontend/src/CommandCenter.jsx` | 2,3 | Ghost View toggle, timeline scrubber, HITL panel |
| `frontend/src/RecruiterPanel.jsx` | 3 | HITL audit trail UI |
| `frontend/src/useContVerification.js` | 3 | Fix ref mutation, face embedding hash |
| `frontend/src/useKeystrokeDynamics.js` | 3 | Fix NaN from null timestamps |
| `frontend/index.html` | 0 | Restrict CSP wss://* (C-12), add Permissions-Policy (H-1) |
| `frontend/src/ScoreReport.jsx` | 3 | Remove `window.__aegisGazeEntropy` global (L-13) |

### Infrastructure (6 files)
| File | Phase | Change |
|------|-------|--------|
| `Dockerfile` | 0 | `USER 1000`, `HEALTHCHECK`, exec-form CMD |
| `docker-compose.yml` | 0,6 | Redis auth, JWT_SECRET required, health checks |
| `.github/workflows/ci.yml` | 6 | CI/CD pipeline (ruff→pytest→pip-audit, lint→test→build, trufflehog→trivy) |
| `.gitignore` | 0 | Add `*.env`, `*.env.*` |
| `.dockerignore` | 6 | Add `**/.env` |
| `alembic/env.py` | 6 | Dynamic DATABASE_URL from settings (H-16) |

---

## Success Metrics & Verification

| Metric | Current | Target | Phase | Measurement |
|--------|---------|--------|-------|-------------|
| Security CRITICAL findings | 12 | 0 | 0 | Production audit checklist |
| KS-test false positive rate | ~25% | < 5% | 1 | Per-session KS alert rate |
| PLR liveness pass rate (live) | 0% (broken) | > 95% | 0,1 | `v4_liveness.passed` metric |
| WS reconnection success | 0 (no retry) | > 99% | 3 | Connection uptime metric |
| Whitespace fixation detection | DEAD CODE | Operational | 0,1 | Cluely detection rate |
| Challenge-response coverage | DEAD CODE | 4+ challenge types | 0,4 | Challenge library count |
| GenD deepfake detection | NOT IMPLEMENTED | Operational | 4 | GenD inference endpoint |
| EU AI Act compliance | 0 artifacts | All artifacts filed | 5 | FRIA, bias audit, transparency notice |
| N>=3 fusion rule | NOT IMPLEMENTED | Operational | 1,2 | fusion_agent.py N>=3 trigger |
| Temporal accumulation | NOT IMPLEMENTED | Operational | 1,2 | fusion_agent.py windowed risk |
| Combined PLR+rPPG check | NOT IMPLEMENTED | Operational | 0,1 | liveness_agent.py fusion |
| Security test coverage | 0 critical tests | 100% critical paths | 6 | pytest security suite |
| Total tests | 27 | 60+ | 6 | pytest count |
| LGBTQ+ accommodation mode | NOT IMPLEMENTED | Operational | 2 | Store flag + tracking disable |
| Docker image size | Unknown | < 500MB | 6 | `docker images` |
| Concurrent sessions | Unknown | 100+ | 6 | Load test |

---

## Research Paper to Code Mapping

| Paper | Section | Concept | Code Component | Phase |
|-------|---------|---------|---------------|-------|
| AEGIS v3.0 | §10.1 | Whitespace fixation detection | `gaze_agent.py`, `forensic_engine.py` | 0,1 |
| AEGIS v3.0 | §10.2 | KS-test per-candidate gaze baseline | `baseline_agent.py` → `gaze_agent.py` | 1 |
| AEGIS v3.0 | §10.3 | Combined PLR+rPPG liveness | `liveness_agent.py`, `PlrChallenge.jsx` | 0,1 |
| AEGIS v3.0 | §10.4 | Cross-dataset deepfake / challenge-response | `deepfake_agent.py`, `ChallengeResponseDeepfake.jsx` | 0,4 |
| AEGIS v3.0 | §10.5 | Five-channel fusion with N>=3 | `fusion_agent.py` | 1,2 |
| AEGIS v3.0 | §5.4 | PLR stimulus (0.5-2.0 Hz) | `liveness_agent.py` | 1 |
| AEGIS v3.0 | §5.6 | KS-test calibration (90s) | `baseline_agent.py` + calibration UI | 2 |
| AEGIS v3.0 | §6.2 | 33-keypoint BlazePose mapping | `kinematic_agent.py` | Verify 0 |
| AEGIS v3.0 | §7.3 | Gotcha challenge-response | `ChallengeResponseDeepfake.jsx` | 0,4 |
| AEGIS v3.0 | §8 | Five-layer defense architecture | All agents + fusion | All phases |
| AEGIS v3.0 | §11.4 | 5-channel fusion with severity levels | `fusion_agent.py` | 1,2 |
| AEGIS v3.0 | §12 | EU AI Act, GDPR, BIPA compliance | Compliance artifacts | 5 |
| Anatomy Paper | §2-3 | Edge-Cloud hybrid architecture | Already implemented (WebSocket pipeline) | Verify 0 |
| Anatomy Paper | §4 | Multi-person pose detection (num_poses=4) | `kinematic_agent.py` | Verify 0 |
| Anatomy Paper | §5 | PLR/rPPG as anti-spoofing | `liveness_agent.py` | 1 |
| Anatomy Paper | §6 | Data minimization principle | Code audit (Phase 5) | 5 |
| Architecting Integrity | §2 | Asymmetric information principle | Minimal candidate UI, maximal recruiter dashboard | 2,3 |
| Architecting Integrity | §3 | Accommodation Mode for medical conditions | Store config + tracking disable | 2 |
| Architecting Integrity | §4 | Ghost View for recruiters | `CommandCenter.jsx` | 2 |
| Architecting Integrity | §5 | 6-month roadmap (5 phases) | This plan (12 weeks) | All |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation | Phase |
|------|-----------|--------|-----------|-------|
| High false positive rate on gaze | MEDIUM | HIGH | KS-test per-candidate baseline (Gap 2), accommodation mode, contextual suppression during speech | 1,2 |
| Cluely updates to evade whitespace detection | HIGH | MEDIUM | Add lag loop detection + overlay clustering as parallel signals; continuous arms race | Ongoing |
| EU AI Act delay (Digital Omnibus to Dec 2027) | MEDIUM | LOW | Plan for Aug 2026 deadline; over-compliance is safer than under-compliance | 5 |
| GenD model too large for client-side (50MB) | MEDIUM | LOW | Server-side inference at `/api/v1/gend/infer`; ONNX quantization for future client path | 4 |
| WebGPU not available (~18% users) | MEDIUM | MEDIUM | WebGL fallback for CV inference; graceful degradation | Verify 0 |
| Biometric privacy backlash | LOW | HIGH | Data minimization (raw data NEVER leaves device), transparent privacy policy, accommodation mode | 5 |
| New cheating tools targeting whitespace signal | MEDIUM | MEDIUM | Whitespace is one of 5+ channels; N>=3 fusion requirement means single-channel evasion is insufficient | 2 |

---

## Weekly Sprint Allocation

| Week | Phase | Focus | Dev-Days | Key Deliverable |
|------|-------|-------|----------|-----------------|
| 1 | 0 | Wire dead code + critical security (0.1-0.7) | 4 | All 5 detector pipelines wired, S-1..S-3 fixed |
| 2 | 0 | Critical security (0.8-0.13) | 4 | All 12 CRITICAL findings fixed, C-1..C-12 resolved |
| 3 | 1 | Agent fixes (1.1-1.5) | 4 | gaze, liveness, deepfake, fusion, baseline agents corrected |
| 4 | 1 | Agent consolidation + fraud (1.6-1.9) | 3 | 4→1 fusion, 4→1 KS-test, 6 new signals in fraud_agent |
| 5 | 2 | Calibration + orchestration (2.1-2.4) | 4 | 90s calibration, KS-test wired into fusion, whitespace wired, PLR+rPPG wired |
| 6 | 2 | Fusion + Ghost View (2.5-2.8) | 4 | N>=3 rule live, accommodation mode, Ghost View prototype, 10-vector security active |
| 7 | 3 | WebSocket rewrite + store (3.1-3.2) | 3 | Stable WebSocket reconnection, reactive store |
| 8 | 3 | Liveness flow + React fixes (3.3-3.7) | 4 | PlrChallenge integrated, React 19 violations fixed, Command Center timeline, HITL audit |
| 9 | 4 | Deepfake pipeline (4.1-4.3) | 3 | GenD server endpoint, challenge-response library, ONNX path planned |
| 10 | 4 | Deepfake hardening (4.4-4.6) | 3 | Lip-sync fix, rPPG spoof detection, cross-dataset evaluation |
| 11 | 5 | EU AI Act + bias compliance (all) | 4 | FRIA, bias audit, transparency notice, data minimization audit |
| 12 | 6 | Infrastructure + testing (all) | 5 | 60+ tests, CI/CD, Docker hardening, PostgreSQL, PDF reports, launch |
