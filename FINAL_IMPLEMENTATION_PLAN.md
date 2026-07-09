# Aegis Interview Platform — Final Implementation Plan v2.0

> **Synthesized from:** 3 research papers, 9 spec documents, 3 existing implementation plans, 1 production audit, full codebase analysis (40+ backend files, 40+ frontend files)
> **Research Sources:** "Architecting Integrity" (Dual-Experience Blueprint), "Anatomy of Fraud & Defense" (AEGIS Research Institute, v3.0), "Anatomy of a Cheater-Proof Room" (Proctoring Technology Deconstruction)
> **Total issues found:** 92+ defects across security, runtime, architecture, testing

---

## Strategic Insights from Research Papers

### Paper 1: "Architecting Integrity" — Dual-Experience Blueprint
- **Asymmetric information principle**: Candidate interface = minimal cognitive load, Admin interface = maximal data
- **PLR + rPPG combined** is the most powerful liveness signal (99.0-99.4% TPR)
- **5-phase 6-month roadmap** with dedicated red-team phase
- **Accommodation Mode** for medical conditions (Tourette's, visual impairments)

### Paper 2: "Anatomy of Fraud & Defense" — Deep Technical Intelligence
- **5 Unsolved Problems** the codebase must address:
  1. **Whitespace fixation detection** — ONLY webcam-detectable Cluely signal
  2. **Per-candidate KS-test gaze baseline** — replaces broken universal thresholds
  3. **Combined PLR + rPPG single check** — both signals, one 10-second challenge
  4. **Cross-dataset deepfake generalization** — challenge-response > pixel detection
  5. **Five-channel fusion with N>=3 rule** — require 3+ simultaneous deviations
- **71% candidates admit cheating**, 80% use LLMs on coding tests
- **Cluely raised $5.3M** — claims zero documented detections (whitespace fixation is the countermeasure)
- **CAST deepfake: 99.49% AUC** on known datasets, drops to **74.92% on unseen** (25-point generalization gap)

### Paper 3: "Anatomy of a Cheater-Proof Room" — Technology Deconstruction
- **Edge-Cloud hybrid architecture** — CV on-device (WebAssembly/WebGPU), analytics in cloud
- **MediaPipe Pose 33-keypoint** + **OpenPose PAF** for multi-person detection
- **PLR measurement** via screen brightness cycling + FaceMesh pupil diameter
- **rPPG heartbeat extraction** via RGB channel FFT (0.3R + 0.59G + 0.11B)
- **Data minimization**: raw biometric data NEVER leaves device; only anonymized telemetry

---

## Implementation Roadmap — 20 Weeks

| Phase | Name | Timeline | Effort | Key Deliverables |
|-------|------|----------|--------|------------------|
| **0** | Critical Security & Runtime Fixes | Week 1-2 | 5 dev-days | 12 CRITICAL security fixes, 10 CRITICAL runtime bugs |
| **1** | Biometric Pipeline Repair | Week 3-4 | 8 dev-days | Fix PLR, KS-test, MediaPipe indices, wire dead code |
| **2** | Research Paper Innovations | Week 5-8 | 12 dev-days | Whitespace fixation, combined PLR+rPPG, N>=3 fusion |
| **3** | Frontend Architecture Rewrite | Week 9-10 | 8 dev-days | WebSocket reconnection, reactive store, liveness integration |
| **4** | Full-Stack Integration | Week 11-12 | 6 dev-days | Ghost View, Command Center, HITL audit trail |
| **5** | Security Hardening & Testing | Week 13-16 | 10 dev-days | Comprehensive test suite, red team, bias audit |
| **6** | Infrastructure & DevOps | Week 17-18 | 6 dev-days | Docker hardening, CI/CD, monitoring |
| **7** | New Features & Performance | Week 19-20 | 6 dev-days | Invitation system, PDF reports, frame skipping, pool sizing |

---

## PHASE 0 — CRITICAL SECURITY & RUNTIME FIXES (Week 1-2)

### S-1 through S-10: Security Vulnerabilities
Apply fixes from `IMPLEMENTATION_PLAN.md` Phase 0 — ALL 10 critical security items:

| ID | Issue | Key Fix | File:Line |
|----|-------|---------|-----------|
| S-1 | WebSocket accept-before-auth | Auth before accept, close 4003 on failure | `main.py:591,739,917` |
| S-2 | SKIP_AUTH bypass | `SKIP_AUTH = False`, add `FAIL_SECURE` env var | `auth.py:6`, `.env` |
| S-3 | JWT in WebSocket query params | Move to `Sec-WebSocket-Protocol` header | `auth.py:80` |
| S-4 | No per-session auth on reports | Add `require_session_access()` to ALL endpoints | `main.py:1094-1150` |
| S-5 | Recruiter session hijacking | Validate recruiter is assigned to session | `main.py:933` |
| S-6 | Unvalidated session_id from query params | Always generate server-side | `main.py:605` |
| S-7 | No size limits on base64 frames | Reject frames > 5MB | `main.py:329-332` |
| S-8 | ALLOWED_HOSTS includes 0.0.0.0 | Remove from defaults | `main.py:162` |
| S-9 | Hardcoded invitation code | CSPRNG per-candidate codes, hash in DB | `protocol_engine.py:57,89` |
| S-10 | Origin validation broken | Normalize origin, use WS close codes | `auth.py:97-100` |

### Additional Critical Findings (from AEGIS_PRODUCTION_AUDIT.md)
| C-1 | `.env` committed to git | Add `.gitignore`, `git rm --cached` | Root |
| C-2 | JWT_SECRET ephemeral fallback | `raise RuntimeError` if not set or < 32 chars | `auth.py:19-22` |
| C-3 | No prompt injection guard | Add regex detection + sanitization | `main.py:946`, `hub.py` |
| C-4 | Client-side lockdown authority | Move zero-tolerance logic server-side | `useAegisStore.js:62-138` |
| C-5 | MCP invoke unvalidated dict | Add Pydantic model validation | `main.py:1247-1259` |
| C-6 | Docker runs as root | Add `USER 1000` | `Dockerfile` |
| C-7 | Bias audit fail-SAFE | Fail-DEADLY: UNSAFE on any error | `bias_agent.py:121-127` |
| C-8 | MediaPipe not thread-safe | Use `asyncio.Lock()` per instance | `main.py:254-259` |
| C-9 | EventBatcher DB session leak | Add retry + rollback fix | `event_batcher.py:56-68` |
| C-10 | Refresh token set unbounded | `TTLCache(maxlen=10000)` | `auth.py:42` |
| C-11 | WS no max_size | Add `max_size=10MB` to all `receive_text()` | `main.py:671,878` |
| C-12 | CSP `wss://*:` wildcard | Restrict to exact origins | `index.html:6` |

### R-1 through R-10: Critical Runtime Bugs
| ID | Issue | Fix | File |
|----|-------|-----|------|
| R-1 | Wrong MediaPipe lip indices | Use 13/14 for 478-point model (inner lips) | `main.py:544-549` |
| R-2 | KS-test 2-element sample | Buffer x/y separately, test independently | `hub.py:237` |
| R-3 | LivenessChallenge doesn't check anything | Wire to backend + add PlrChallenge | `LivenessChallenge.jsx` |
| R-4 | `ingest_security_features` dead code | Wire into `ws_cv` processing loop | `hub.py:208-266` |
| R-5 | `gesture_event.to_dict()` will crash | Add `to_dict()` or use `dataclasses.asdict()` | `hub.py:257` |
| R-6 | `keyboard_typing_active` → hand_anomaly | Wire actual keystroke data or pass `False` | `main.py:658` |
| R-7 | Fusion engine accumulates forever | Add time-based window, clear after evaluate | `security_engine.py:243-277` |
| R-8 | PLR gets frame_brightness not stimulus | Accept `stimulus_brightness` from frontend | `main.py:517`, `forensic_engine.py:270-275` |
| R-9 | Frontend ignores v4_liveness alerts | Check `v4_liveness.passed` in handleCv | `InterviewArena.jsx:272-345` |
| R-10 | Event name mismatch (`candidate_answer` vs `question_delivered`) | Use same event name in add/remove | `useResponseTiming.js:228,232` |

### Additional Critical Backend Bugs (from audit)
| ID | Issue | Fix |
|----|-------|-----|
| C-backend-1 | `typing` undefined in `validate_session_id` | Add `import typing` |
| C-backend-2 | `JSONResponse` undefined in `spa_fallback` | Add `from fastapi.responses import JSONResponse` |
| C-backend-3 | `cache.py.ensure_connected()` missing | Define method or remove calls |
| C-backend-4 | `ear_left + ear_right` can be None | Guard against None |

### Additional Critical Frontend Bugs (from audit)
| C-frontend-1 | `process.env` undefined in Vite 8 | Replace with `import.meta.env` |
| C-frontend-2 | No TypeScript parser in ESLint | Add `@typescript-eslint/parser` |

---

## PHASE 1 — BIOMETRIC PIPELINE REPAIR (Week 3-4)

### 1.1 Fix KS-Test Statistical Baseline (Research Paper 2 - Gap 2)
**Current:** Two-element sample against single-axis distribution. Statistically meaningless.

**Research-backed fix:**
```python
# In hub.py — per-candidate baseline with proper KS-test (p < 0.05)
# CALIBRATION PHASE (first 90 seconds): Build gaze distribution
# CONTINUOUS MONITORING: Rolling 10-second windows
# KS-TEST: Two-sample KS-test, active window vs personal baseline
# FLAG ONLY when p < 0.05 (statistically significant deviation)
# CONTEXTUAL SUPPRESSION: Suppress if candidate is speaking
```

**Files:** `hub.py:228-237`, `security_engine.py:60,75`, `forensic_engine.py`
- Buffer screen_x AND screen_y independently
- Implement proper p-value approximation (not fixed D > 0.35)
- Fix tie-handling (`<=` → `<`)
- Add contextual suppression during speech

### 1.2 Fix PLR/rPPG Liveness Pipeline (Research Paper 2 - Gap 3)
**Current:** `screen_brightness_level` maps to webcam ambient brightness, not screen flash.

**Fix:**
- Frontend: Send `stimulus_brightness` with every frame during PLR challenge
- Backend: Accept and use `stimulus_brightness` in `ForensicObservation`
- PLR evaluation: Require `b_curr - b_prev >= 0.5` from actual stimulus, not ambient

**Files:** `main.py:517`, `forensic_engine.py:270-275`, `LivenessChallenge.jsx`

### 1.3 Wire Dead-Code Security Pipeline
**Current:** `ingest_security_features()` at `hub.py:208-266` is defined but NEVER called. All evaluators allocated but never run.

**Fix:** Call `hub.ingest_security_features(result)` from `ws_cv` processing loop (`main.py:645`).

**Files:** `hub.py`, `main.py`

### 1.4 Fix MediaPipe Face Landmark Indices
**Current:** `main.py:544-549` uses indices 13/14 from dlib 68-point model. MediaPipe 478-point model maps these differently.

**Fix:** Verify against MediaPipe canonical topology and use correct landmarks.

---

## PHASE 2 — RESEARCH PAPER INNOVATIONS (Week 5-8)

### 2.1 Whitespace Fixation Detection (Research Paper 2 - Gap 1 — NOVEL)
**Research insight:** The ONLY webcam-detectable signal for Cluely compositor-layer overlays. Candidates using invisible overlay tools fixate on UI whitespace where no test content exists.

**Implementation:**
```python
# New: backend-cv/agents/whitespace_detector.py
# 1. Extract UI layout zones from frontend (content vs whitespace mapping)
# 2. Transform gaze coordinates to UI coordinate system
# 3. KDE density estimation on gaze points in whitespace regions
# 4. Flag when whitespace concentration ratio > threshold
```

**Integration:** Add as 6th channel to FiveChannelFusionEngine or standalone risk signal.

### 2.2 Combined PLR + rPPG Single 10-Second Check (Research Paper 2 - Gap 3 — NOVEL)
**Research insight:** No published system combines both in a single check. PLR detects absence of pupillary response; rPPG detects absence of heartbeat. Together >99.5% theoretical.

**Implementation:**
```python
# New: backend-cv/agents/plr_rppg_engine.py
# 1. Frontend sends 10-second challenge: screen flash cycle at 0.5-2.0 Hz
# 2. PLR: Measure pupil constriction amplitude + latency (200-300ms)
# 3. rPPG: Extract heartbeat from green channel (0.59G) via FFT
# 4. Both must pass for liveness_confirmed = True
```

**Files:** `forensic_engine.py` (enhance existing `PLRrPPGLivenessEngine`), `PlrChallenge.jsx` (integrate into liveness flow)

### 2.3 Five-Channel Fusion with N>=3 Rule (Research Paper 2 - Gap 5)
**Research insight:** Individual channels have 15-25% false negative rates. Fusion with N>=3 concurrent deviations makes evasion exponentially harder.

**Channels:**
1. **Visual-Face (Gaze)** — KS-test baseline, whitespace ratio, off-screen duration (25% weight)
2. **Visual-Body (Gesture)** — Hand-to-ear, off-camera reach, multi-person (20% weight)
3. **Audio (Forensics)** — Secondary voice, MAR mismatch, flatline latency (20% weight)
4. **Keystroke (Dynamics)** — WPM, dwell/flight time, code injection detection (20% weight)
5. **Content (NLP/Semantic)** — Vocabulary jump, LLM phrasing, response timing (15% weight)

**Fusion Decision Matrix:**
| Active Channels | Severity | Action |
|----------------|----------|--------|
| 0-1 | None | Silent log, no score impact |
| 2 | LOW | Logged, -5 integrity |
| 3 | MEDIUM | Yellow flag, -15 integrity |
| 4 | HIGH | Amber flag + human review, -30 integrity |
| 5 | CRITICAL | Red flag + session pause + mandatory human review |

**Implementation:** Rewrite `FiveChannelFusionEngine` with sliding window (10s), per-channel weighted scoring, N>=3 threshold.

**Files:** `security_engine.py:242-282` (rewrite), `fusion_engine.py` (delete 3 of 4 duplicates)

### 2.4 Deepfake Detection — Challenge-Response (Research Paper 2 - Gap 4)
**Research insight:** CAST drops 25 points on unseen datasets (99.49% → 74.92%). Challenge-response (Gotcha) is more reliable for novel deepfakes.

**Activate existing `ChallengeResponseDeepfake.jsx`:**
- Rapid head turns (extreme angles break face-swap pipelines)
- Hand-over-face (occlusion causes inpainting artifacts)
- Lighting changes (skin tone inconsistencies in rendered faces)
- Simultaneous speech + movement (AV sync failures)

---

## PHASE 3 — FRONTEND ARCHITECTURE REWRITE (Week 9-10)

### 3.1 WebSocket with Exponential Backoff Reconnection
**Current:** `useWebSocket.js` — no reconnection, queue drains to handler not WS.

**Fix:** Implement with `MAX_RETRIES=10`, `BASE_DELAY=1s`, `MAX_DELAY=30s`, real queue drain to `ws.send()`.

### 3.2 Reactive Store Selectors
**Current:** `App.jsx:183-185` uses `useAegisStore.getState()` in JSX — no re-renders.

**Fix:** Create selector hooks: `useIntegrityScore`, `usePhase`, `useMessages`.

### 3.3 PlrChallenge Integration into Liveness Flow
**Current:** `PlrChallenge.jsx` (433 lines) is dead code — never imported.

**Fix:** Integrate as Step 2 of `LivenessChallenge`: gaze → plr → gotcha → done.

### 3.4 Fix useDigitalSecurity — Add Vector 6 (CSS Injection Scan)
Add periodic `document.styleSheets` scanning for `chrome-extension://` and `moz-extension://` sources.

### 3.5 Fix All React 19 Violations
- 7 hooks with ref-mutation during render: move updates to `useEffect`
- 5 components with `setState` in `useEffect`: extract to event handlers
- 3 impure render calls: wrap in `useMemo`

---

## PHASE 4 — FULL-STACK INTEGRATION (Week 11-12)

### 4.1 Ghost View for Recruiter Dashboard (Research Paper 1 - Dual Experience)
**Feature:** Toggleable overlay on recruiter video player showing MediaPipe skeletal wireframe + gaze vectors.

### 4.2 Command Center Timeline
- Scrubable multi-layer timeline: gaze heatmap, head pose, audio anomalies
- Click red flag → jump to timestamp + pause video
- Side panel shows raw CV data that triggered each alert

### 4.3 HITL Audit Trail
- Persist all TERMINATE/WARN/FLAG decisions to DB
- Include recruiter identity, timestamp, correlation ID

### 4.4 Accommodation Mode (Research Paper 1)
- Disable sensitive tracking (gaze, micro-expressions) for medical conditions
- Fall back to identity verification + environment scan only
- Configurable by recruiter per session

---

## PHASE 5 — SECURITY HARDENING & TESTING (Week 13-16)

### 5.1 Comprehensive Test Suite
| Area | Tests | Current | Target |
|------|-------|---------|--------|
| Auth | Register, login, refresh, invalid tokens, CSRF | 0 | 10 |
| Rate limiting | IP, per-session, recruiter limits | 0 | 6 |
| WebSocket | Auth, CV, interview, recruiter flows | 0 | 8 |
| Forensic engine | PLR, KS-test, whitespace, kinematic edge cases | 0 | 8 |
| E2E | Health, register, session, integrity report | 0 | 4 |
| MCP | Tool validation, auth, injection prevention | 0 | 4 |

### 5.2 Red Team Exercise
Focus on all 6 cheating layers from Paper 2:
1. Invisible overlay tools (Cluely simulation)
2. Deepfake video + voice cloning
3. Proxy interview networks
4. Virtual machines + hardware exploits
5. Secondary devices + wearables
6. Generative AI answer injection

### 5.3 Bias & Fairness Audit
- Test all CV models across diverse demographics
- Verify false positive/negative rates are consistent
- Document results per NYC Local Law 144 / EU AI Act requirements

---

## PHASE 6 — INFRASTRUCTURE & DEVOPS (Week 17-18)

### 6.1 Docker Hardening
- Non-root user (`USER 1000`)
- Health checks on all services
- Remove `0.0.0.0` from ALLOWED_HOSTS
- Split dev requirements → `dev-requirements.txt`
- JWT_SECRET required (no fallback)

### 6.2 CI/CD Pipeline
```yaml
# Backend: ruff check → pytest → pip-audit
# Frontend: npm run lint → npm test → npm run build
# Security: trufflehog, trivy container scan
```

### 6.3 Redis + PostgreSQL Production Config
- Redis TLS + password enforcement
- Connection pooling for both
- Alembic for schema migrations

---

## PHASE 7 — NEW FEATURES & PERFORMANCE (Week 19-20)

### 7.1 Invitation-Based Session Start
- CSPRNG token generation (secrets.token_hex(32))
- Hash stored in DB, code sent via email
- No auth required for candidate entry

### 7.2 Post-Interview PDF Report
- Integrity score, risk breakdown, event timeline
- Downloadable from Command Center

### 7.3 Frame Skipping (Target 10 FPS)
```python
class FrameSkipper:
    def __init__(self, target_fps=10):
        self.target_fps = target_fps
    
    def should_process(self):
        now = time.time()
        if now - self._last_process_time < 1.0 / self.target_fps:
            return False
        self._last_process_time = now
        return True
```

### 7.4 Dynamic MediaPipe Pool Sizing
- CPU + RAM aware: `max(2, min(cpu_count*2, memory_gb/0.4, 16))`

---

## FILE CHANGE INVENTORY

| File | Phase | Change |
|------|-------|--------|
| `backend-cv/main.py` | 0,1,2 | Security fixes, PLR/stimulus fix, ws wiring |
| `backend-cv/auth.py` | 0,5 | JWT fail-hard, TTL cache, WS auth via protocol header |
| `backend-cv/agents/hub.py` | 0,1,2,4 | KS-test fix, wire security pipeline, parallel dispatch |
| `backend-cv/agents/forensic_engine.py` | 1,2 | PLR fix, kinematic hardening, KS-test proper |
| `backend-cv/agents/security_engine.py` | 0,2 | Fusion rewrite (windowed, N>=3), KS-test fix |
| `backend-cv/agents/whitespace_detector.py` | 2 | CREATE — new whitespace fixation detector |
| `backend-cv/agents/plr_rppg_engine.py` | 2 | CREATE — combined PLR+rPPG engine |
| `backend-cv/agents/bias_agent.py` | 0 | Fail-deadly on audit error |
| `backend-cv/agents/fraud_agent.py` | 2 | Session duration normalization |
| `backend-cv/agents/utils.py` | 2 | Unified `compute_integrity_score` |
| `backend-cv/agents/circuit_breaker.py` | 2 | Circuit breaker pattern |
| `backend-cv/cache.py` | 0,6 | `ensure_connected()`, Redis TLS |
| `backend-cv/monitoring.py` | 6 | Prometheus cardinality control |
| `backend-cv/report_generator.py` | 7 | CREATE — PDF report generator |
| `frontend/src/useWebSocket.js` | 3 | REWRITE — exponential backoff, real queue drain |
| `frontend/src/useAegisStore.js` | 0,3 | Remove client lockdown, reactive selectors |
| `frontend/src/LivenessChallenge.jsx` | 1,2,3 | Wire to backend, integrate PlrChallenge |
| `frontend/src/PlrChallenge.jsx` | 2 | Activate dead code, send stimulus_brightness |
| `frontend/src/InterviewArena.jsx` | 0,3 | v4_liveness handling, event name fix |
| `frontend/src/useDigitalSecurity.js` | 3 | Add Vector 6 (CSS injection scan) |
| `frontend/src/useResponseTiming.js` | 0 | Fix event name mismatch |
| `frontend/src/ChallengeResponseDeepfake.jsx` | 2 | Activate challenge-response liveness |
| `frontend/src/CommandCenter.jsx` | 4 | Ghost View, timeline scrubber |
| `frontend/src/RecruiterPanel.jsx` | 4 | HITL audit trail |
| `frontend/src/useContVerification.js` | 3 | Fix ref mutation, face embedding |
| `frontend/src/useKeystrokeDynamics.js` | 3 | Fix NaN from null timestamps |
| `docker-compose.yml` | 0,6 | Health checks, Redis auth, non-root |
| `.github/workflows/ci.yml` | 6 | CI/CD pipeline |
| `Dockerfile` | 0 | Non-root user, health check |

---

## SUCCESS METRICS

| Metric | Current (June 2026) | Target (Dec 2026) | Measurement |
|--------|---------------------|-------------------|-------------|
| Security CRITICAL findings | 22 | 0 | Audit checklist |
| KS-test false positive rate | ~25% | < 5% | Per-session alert count |
| PLR liveness pass rate (live) | 0% (broken) | > 95% | `v4_liveness.passed` metric |
| WS reconnection success | 0 (no retry) | > 99% | Connection uptime |
| Agent circuit breaker uptime | N/A | > 99.9% | Hub agent availability |
| Integrity score consistency | 3 divergent formulas | 1 source | Cross-module comparison |
| Extension detection latency | 2s scan interval | < 500ms | DOM scan timer |
| Security test coverage | 0 critical tests | 100% critical paths | pytest security suite |
| Integration test coverage | 5 tests | 40+ tests | pytest coverage report |
| Concurrent sessions | Unknown | 100+ | Load test |
| Docker image size | Unknown | < 500MB | `docker images` |
| Whitespace fixation detection | NOT IMPLEMENTED | Operational | Cluely detection rate |
| Combined PLR+rPPG check | NOT IMPLEMENTED | Operational | Liveness pass rate |

---

## APPENDIX: Research-to-Code Mapping

| Research Paper | Section | Code Component | Implementation Phase |
|----------------|---------|----------------|---------------------|
| Paper 2 | Gap 1: Whitespace Fixation | New `whitespace_detector.py` | Phase 2 |
| Paper 2 | Gap 2: Per-Candidate KS-Test | `hub.py:228-237`, `security_engine.py` | Phase 1 |
| Paper 2 | Gap 3: Combined PLR+rPPG | `forensic_engine.py`, `PlrChallenge.jsx` | Phase 2 |
| Paper 2 | Gap 4: Deepfake Generalization | `ChallengeResponseDeepfake.jsx` | Phase 2 |
| Paper 2 | Gap 5: Five-Channel Fusion | `security_engine.py` (rewrite) | Phase 2 |
| Paper 1 | Dual Experience Principle | `InterviewArena.jsx` + `CommandCenter.jsx` | Phase 4 |
| Paper 1 | Accommodation Mode | Store config + tracking disable | Phase 4 |
| Paper 3 | Edge-Cloud Architecture | Already implemented (WebSocket pipeline) | Verify Phase 0 |
| Paper 3 | Data Minimization | On-device processing only | Verify Phase 0 |
| Paper 3 | PLR + rPPG Liveness | `forensic_engine.py` | Phase 1-2 |
| Paper 3 | Multi-Person Detection | MediaPipe `num_poses=4` | Verify Phase 0 |
