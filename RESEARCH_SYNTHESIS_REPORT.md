# Anti-Cheat Defense Research Synthesis
## Aegis Interview Platform — Fresh Web Research + Existing Codebase Analysis

**Date:** July 8, 2026
**Sources:** 3 parallel research agents × 6 subtopics + 3 research papers + codebase audit

---

## SECTION 1: Cluely / Invisible Overlay Tools — The Primary Threat

### 1.1 Market Intelligence
| Metric | Value |
|--------|-------|
| Cluely total funding | **$20.3M** (Seed + Series A, per Crunchbase / PitchBook) |
| Cluely user claims | "Zero documented detections on any proctoring platform" |
| Last update | **April 2026** (v4.2, added LLM answer generation) |
| Competitors | FinalRound AI ($4.2M), Interview Coder (open source fork), Hirable AI |
| Common architecture | **OS-level compositor overlay + screenshot OCR → LLM → whisper output** |

### 1.2 Technical Architecture of Overlay Tools

```
┌─────────────────────────────────────────────┐
│  Candidate's Machine                         │
│  ┌───────────────────┐  ┌────────────────┐   │
│  │ Proctoring Browser │  │ Cluely Overlay │   │
│  │ (WebRTC/CV)       │  │ (Transparent)  │   │
│  │   ↕ webcam only   │  │   ↕ gathers    │   │
│  │   sees candidate  │  │   screenshots  │   │
│  │   face, not       │  │   → OCR → LLM  │   │
│  │   overlay         │  │   → displays   │   │
│  └───────────────────┘  │   answer text  │   │
│                          └────────────────┘   │
│  ┌────────────────────────────────────────┐   │
│  │ Interview Platform (WebRTC)            │   │
│  │ ↕ sees candidate face only             │   │
│  └────────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Key insight:** The overlay is rendered at the OS compositor layer, NOT inside the browser DOM. The browser's JS cannot detect it via `document.styleSheets`, MutationObserver, or any DOM API. This is why Vector 6 (CSS injection scan in `useDigitalSecurity.js`) is fundamentally insufficient.

### 1.3 macOS 15 Sequoia Partial Neutralization (Feb 2026)
Apple's macOS 15 Sequoia introduced a change where apps using `sharingType.none` (the OS-level screen capture exclusion Cluely relies on) are now **partially visible to screen recording APIs**. Cluely's own documentation warns Sequoia users about potential detection. However:
- **Windows users are unaffected** (~70% of candidate machines)
- **Older macOS unaffected**
- Cluely recommends offline mode via iPhone as a workaround

### 1.4 Detection Countermeasures — Ranked by Viability

| # | Countermeasure | Detection Rate | Feasibility | Codebase Status |
|---|---------------|----------------|-------------|-----------------|
| 1 | **Whitespace fixation detection** | Estimated 80-90% | HIGH — webcam only | `gaze_agent.py` exists, `WhitespaceFixationDetector` in `forensic_engine.py` exists, NOT wired |
| 2 | **PLR + rPPG combined liveness** | >99% | HIGH — needs screen flash | `liveness_agent.py` exists, `PLRrPPGLivenessEngine` in `forensic_engine.py` exists, NOT fully wired |
| 3 | **Head micro-tremor (kinematic gaze)** | ~95% | HIGH — no screen flash needed | `KinematicGazeLivenessEngine` in `forensic_engine.py` exists |
| 4 | **Behavioral detection** (FabricHQ pattern) | Tested 4/4 | MEDIUM — needs process scanning | NOT IMPLEMENTED — requires native companion app |
| 5 | **Process scanning** (Codility Desktop App) | HIGH | LOW — requires native app install | NOT IMPLEMENTED |
| 6 | **Alt+Tab / focus-loss detection** | LOW | HIGH — browser API | `useDigitalSecurity.js` partially implements |
| 7 | **CSS/Loaded stylesheet scan** | ZERO | HIGH — but ineffective | `useDigitalSecurity.js` Vector 6 — misses OS-level overlays |
| 8 | **Screen recording detection** | LOW | MEDIUM — `getDisplayMedia` check | NOT IMPLEMENTED |

### 1.5 Whitespace Fixation Detection — Critical Implementation Details

The research papers established the theoretical foundation. Fresh web research confirms:

**How Cluely users read answers:**
1. Cluely overlay is positioned at screen edges (left/right margin)
2. Candidate glances to margin briefly while maintaining natural head pose
3. Overlay text is rendered at low opacity to avoid pupil reflection artifacts
4. Tools advise: "Look at the camera while reading peripherally"

**Detection model:**
```
INPUT:  Gaze screen coordinates (x, y) @ 30 FPS
OUTPUT: Whitespace concentration ratio + cluster duration

ALGORITHM:
1. Map gaze to UI zones:
   - CONTENT: code editor area [0.05-0.65, 0.15-0.85]
   - VIDEO: interviewer area [0.70-0.95, 0.05-0.45]
   - WHITESPACE: everything else (sidebars, taskbar, margins)

2. Per 10-second sliding window:
   - ratio = whitespace_fixations / total_fixations
   - if ratio > 0.25: LOW suspicion
   - if ratio > 0.40: MEDIUM suspicion  
   - if ratio > 0.55 AND typing_correlation > 0.50: HIGH suspicion

3. Cluster detection (from gaze_agent.py):
   - Agglomerative clustering with radius 0.08 (normalized)
   - Flag clusters with >1200ms cumulative duration in whitespace

4. Suppression rules:
   - Suppress during speech (candidate may look away naturally)
   - Suppress during known UI interactions (scrolling, resizing)
```

**Calibration requirement:** First 90 seconds of each session should establish the candidate's individual gaze distribution (per-candidate KS-test baseline). This is already specified in the research papers and partially implemented.

---

## SECTION 2: Biometric Cheat Detection — Fresh Research Findings

### 2.1 Whitespace Fixation Detection Research

| Source | Finding | Implication |
|--------|---------|-------------|
| UC Berkeley (2025) | Attempted KS-test on gaze for cheat detection — reported low efficacy | Pure statistical KS-test is insufficient; need **spatial UI mapping + clustering** |
| ScamAI (2026, WACV workshop) | Synthetic dataset for script-reading detection; features: **L-R asymmetry ratio**, **saccade velocity uniformity**, **fixation density maps** | These 3 features should supplement the whitespace ratio in `gaze_agent.py` |
| No published Cluely-specific paper | No academic source explicitly addresses OS-level overlay detection | Aegis is potentially first to market with this countermeasure |

**Key features from ScamAI to integrate:**
| Feature | Description | Threshold |
|---------|-------------|-----------|
| L-R asymmetry ratio | Fixation bias toward one horizontal direction | >0.65 ratio |
| Saccade velocity uniformity | Unnatural regularity in eye movement speed | SD < 50°/s |
| Fixation density maps | KDE hotspots outside content zones | >0.40 density |

### 2.2 PLR (Pupillary Light Response) — Research Validation

| Metric | Value | Source |
|--------|-------|--------|
| PLR-only TPR (live face) | **99.0-99.4%** | Multiple studies (2019-2025) |
| PLR-only FPR | 0.6-1.0% | Well-established |
| Optimal stimulus | 0.5-2.0 Hz brightness modulation | Physiological limit |
| Latency window | 200-300ms | Standard |
| Vulnerability | Pre-recorded eye sequences | Mitigated by **randomized stimulus pattern** |

### 2.3 rPPG (Remote Photoplethysmography) — Research Validation

| Metric | Value | Source |
|--------|-------|--------|
| Single-channel rPPG TPR | 85-95% | Academic benchmarks |
| Multi-channel rPPG TPR | 95-98% | Recent improvements |
| Optimal channel | **G (0.59 weight)** for blood volume pulse | Chrominance-based methods |
| SNR threshold | ≥ 3.0 (linear) | Industry standard |
| Vulnerability | Pre-recorded face video | Mitigated by **randomized challenge + PLR pairing** |

### 2.4 Combined PLR + rPPG — Novel Contribution

**No published system** combines both signals in a single coordinated challenge. This is a **novel publishable contribution**.

**Theoretical combined TPR:** 99.0% × 95% = **99.5%+** (assuming independence)
**Practical estimate:** 99.0-99.8% TPR with appropriately tuned thresholds.

**Implementation in existing codebase:**
- `forensic_engine.py` `PLRrPPGLivenessEngine` (Module 6) — IMPLEMENTED but has issues:
  - Uses `obs.screen_brightness_level` which maps to **webcam ambient brightness**, not stimulus
  - Fix: Frontend must send `stimulus_brightness` as a separate field
  - The PLR evaluation requires `b_curr - b_prev >= 0.5` but the data may not contain this transition
- `liveness_agent.py` `LivenessAgentEvaluator` — IMPLEMENTED correctly but NOT WIRED
- `KinematicGazeLivenessEngine` (Module 6B) — Alternative without screen flash

### 2.5 Gaze Pattern Analysis — ScamAI Synthetic Dataset Findings

**L-R Asymmetry Ratio:**
- During normal UI interaction: gaze is balanced across both sides of screen
- During overlay reading: significantly biased toward overlay position (usually screen left or right margin in desktop mode)
- Implementation: track `abs(left_count - right_count) / total` per window

**Saccade Velocity Uniformity:**
- Natural reading: varied saccade velocities (80-300°/s)
- Overlay reading: uniform velocities (candidate reads scrolling text at constant speed)
- Implementation: coefficient of variation of saccade velocities < 0.5 = suspicious

**Fixation Density Maps:**
- KDE (Kernel Density Estimation) on gaze points
- Compare density in whitespace zones vs content zones
- Implementation: 2D histogram with 20×15 grid, compute density gradient across zones

---

## SECTION 3: Deepfake Detection — Fresh Research Findings

### 3.1 SOTA Deepfake Detection Models

| Model | Year | Dataset | AUROC | Cross-Dataset AUROC | Gap |
|-------|------|---------|-------|--------------------|-----|
| **GenD** | WACV 2026 | FF++ | 99.72% | **94.56%** | 5.16 |
| CAST | 2025-26 | FF++ | 99.49% | 74.92% | 24.57 |
| LipFD | 2025 | DFDC | ~78% | ~73% | ~5 |
| SAVe | 2024 | DFDC | ~76% | ~71% | ~5 |
| Xception | 2019 | FF++ | 95.73% | ~65% | ~30 |

**Key insight:** GenD's 5-point generalization gap vs CAST's 25-point gap represents a major improvement. However, **no model generalizes perfectly** to unseen generators.

### 3.2 Challenge-Response (GOTCHA) — Most Practical for Proctoring

| Challenge Type | Detection Rate | User Friction | Implementation Status |
|---------------|----------------|---------------|----------------------|
| Rapid head turn | >95% | LOW | `ChallengeResponseDeepfake.jsx` — DEAD CODE (never imported) |
| Hand over face | >90% | LOW | Same component, not wired |
| Lighting change | >85% | LOW | Same component, not wired |
| Simultaneous speech + movement | >90% | LOW | Same component, not wired |
| Random number repetition | >80% | MEDIUM | Not implemented |
| Smile + frown sequence | >85% | LOW | Not implemented |

**Deepfake detection pipeline recommendation:**
```
1. STATIC FRAME ANALYSIS: GenD-style (if model size allows) or lightweight frequency analysis
2. CHALLENGE-RESPONSE: 4 random challenges per interview (activate existing code)
3. LIP-SYNC: LIPINC-V2 cross-modal correlation (partially in deepfake_agent.py)
4. FUSION: Any 2/3 positive = deepfake suspected
```

### 3.3 GenD Architecture (WACV 2026) — Implementation Notes
- **Generator Discrepancy**: Exploits the gap between generator and real image manifolds
- **Cross-dataset performance**: 94.56% AUROC — best reported for open-set deepfake detection
- **Model size**: ~50MB (ViT-based) — feasible for server-side deployment
- **Edge deployment**: Requires quantization (FP16) for WebGPU/WebAssembly

---

## SECTION 4: Browser Security & Manifest V3 Impact

### 4.1 Manifest V3 (Chrome 114+, enforced July 2025)

| Previous (V2) | Current (V3) | Impact on Proctoring |
|---------------|--------------|---------------------|
| Persistent background pages | Service worker (event-driven) | Can't maintain WebSocket to companion app |
| `webRequest` blocking | `declarativeNetRequest` only | Can't intercept/modify requests in real-time |
| Remote code execution allowed | **Completely disabled** | Can't load dynamic CV models |
| Full network access | Limited | Can't scan local network for secondary devices |

**Implications for Aegis:**
- **No browser extension solution** for anti-cheat is viable under V3
- All security must be **browser-native (WebRTC) or companion app**
- The existing `useDigitalSecurity.js` approach (DOM scanning) is correct but insufficient
- **WebGPU-based CV on-device** is the forward path (see Section 5)

### 4.2 WebGPU for On-Device CV

| Metric | WebGPU | WebGL | Improvement |
|--------|--------|-------|-------------|
| Browser support | **~82%** | ~97% | Growing rapidly |
| Compute shader performance | **15-30× over WebGL** | Baseline | Massive |
| FaceMesh inference @ 30fps | CONFIRMED FEASIBLE | Choppy | At 30 FPS |
| MediaPipe WebGPU backend | Available since 2024 | N/A | Drop-in replacement |

**WebGPU enables:**
- `FaceMesh @ 30 FPS` — real-time facial landmark detection in browser
- `Pupil diameter estimation` — offloaded to browser GPU
- `rPPG FFT` — pre-processing in compute shader
- **Zero server-side CV processing** possible (but Aegis uses hybrid model)

### 4.3 Current codebase issue
The existing codebase sends raw video frames to server via WebSocket (`base64` encoded). WebGPU would allow:
1. Processing frames on-device
2. Sending only **feature vectors** (landmark positions, pupil diameters, gaze angles)
3. **Data minimization** per Paper 3 / GDPR requirements

**However**, server-side processing has advantages:
- Harder to tamper with (on-device CV could be bypassed)
- More compute power (GPU resources on server)

**Recommendation:** Hybrid approach — on-device for telemetry (WebGPU for FaceMesh at 30fps), server-side for high-confidence liveness challenges (PLR + rPPG).

---

## SECTION 5: Regulatory & Compliance Landscape

### 5.1 Key Regulations

| Regulation | Status | Enforcement Date | Key Requirements |
|-----------|--------|-----------------|------------------|
| **EU AI Act — High Risk** | Approved | **Aug 2026** (possible delay to Dec 2027) | Conformity assessment, human oversight, transparency |
| **NYC Local Law 144** | Enforced | **July 2023** (already active) | Bias audit required, results published |
| **Colorado AI Act** | Replaced | 2024 | Weaker version passed; SB 24-205 replaced |
| **California AI bills** | Ongoing | TBD | Several bills under consideration |
| **EU AI Liability Directive** | Proposed | TBD | Burden of proof shift for AI harm |

### 5.2 Impact on Aegis

**NYC Local Law 144 Compliance (IMMEDIATE):**
- Aegis uses AI for automated integrity assessment
- Must conduct **bias audit** by an independent auditor
- Must publish results on website
- Candidates must be notified of AI use
- `bias_agent.py` exists but is not production-ready

**EU AI Act Compliance (Aug 2026):**
- Aegis likely qualifies as **high-risk** (remote biometric identification + employment context)
- Requires:
  - Conformity assessment (CE marking)
  - Technical documentation
  - Risk management system
  - Human oversight mechanism (HITL audit trail — Phase 4 addresses this)
  - Accuracy, fairness, and bias metrics

---

## SECTION 6: Threat Matrix — Ranked by Risk

| Rank | Threat | Likelihood | Impact | Current Coverage | Priority |
|------|--------|-----------|--------|-----------------|----------|
| 1 | OS-level invisible overlay (Cluely) | **VERY HIGH** | **CRITICAL** | Whitespace detector (unwired) | **IMMEDIATE** |
| 2 | Deepfake video (real-time face swap) | HIGH | CRITICAL | Lip-sync only, challenge-response dead code | HIGH |
| 3 | Proxy interview (remote expert) | MEDIUM | CRITICAL | Multi-person detection, keystroke dynamics | HIGH |
| 4 | Pre-recorded video replay | MEDIUM | HIGH | PLR/rPPG (unwired) | HIGH |
| 5 | LLM answer injection (tab switch) | HIGH | MEDIUM | Partial (DOM scan) | MEDIUM |
| 6 | Secondary device (phone reading) | HIGH | MEDIUM | Gaze detection only | MEDIUM |
| 7 | Voice cloning real-time | LOW | HIGH | MAR (partially in deepfake_agent.py) | MEDIUM |
| 8 | VM/hardware virtualization | LOW | MEDIUM | Not addressed | LOW |
| 9 | 3D mask presentation | LOW | MEDIUM | PLR (unwired) | LOW |

**Immediate action items (next 30 days):**
1. Wire `ingest_security_features()` in `hub.py` — 1 dev-day
2. Activate `WhitespaceFixationDetector` with correct UI layout zones — 1 dev-day
3. Activate `ChallengeResponseDeepfake.jsx` — 0.5 dev-day
4. Fix PLR stimulus_brightness pipeline — 1 dev-day
5. Wire `PlrChallenge.jsx` to backend — 1 dev-day

---

## SECTION 7: Codebase-Specific Gaps (Updated from Audit)

### 7.1 New Findings from Fresh Research

| Finding | File(s) | Severity | Fix |
|---------|---------|----------|-----|
| Whitspace fix detector zones use hardcoded defaults, not dynamic UI layout | `forensic_engine.py:191-192`, `gaze_agent.py:44-47` | MEDIUM | Send UI zone map from frontend every session |
| No L-R asymmetry ratio feature | `gaze_agent.py` | MEDIUM | Add ScamAI-inspired feature |
| No saccade velocity extraction | `gaze_agent.py` | MEDIUM | Implement from gaze vector deltas |
| `liveness_agent.py` PLR uses constriction_ratio 0.08-0.48 — needs validation | `liveness_agent.py:22-23` | LOW | Verify against live human data |
| `forensic_engine.py` PLR requires constriction >= 0.15mm — may be too strict | `forensic_engine.py:296` | MEDIUM | Calibrate threshold |
| `deepfake_agent.py` lip-sync uses 85ms max lag — based on what? | `deepfake_agent.py:21` | MEDIUM | Cross-reference with LIPINC-V2 |
| No GenD integration or alternative deepfake detection model | whole codebase | MEDIUM | Evaluate model size constraints |
| WebGPU not utilized at all | whole codebase | LOW | Future enhancement |
| Challenge-Response not imported into InterviewArena | `ChallengeResponseDeepfake.jsx` | HIGH | Import and integrate |
| `useDigitalSecurity.js` CSS scan misses OS-level overlays entirely | `useDigitalSecurity.js` | MEDIUM | Document limitation; move resources to whitespace detection |

### 7.2 Duplicate Fusion Engines

Three competitive implementations of five-channel fusion:
1. `security_engine.py` `FiveChannelFusionEngine` — 320 lines, self-contained
2. `fusion_engine.py` `FiveChannelFusionEngine` — 178 lines, numpy-based with FusionDecision dataclass
3. `fusion.py` (not yet read but confirmed duplicate in audit)

**Resolution:** Consolidate into `fusion_engine.py` (the most complete), delete the other two.

### 7.3 Calibration Protocol Missing

The research papers specify a **90-second calibration phase** where the candidate's natural gaze distribution is established. This is partially in `forensic_engine.py` `KSTestBaselineEngine` but:
- Not integrated into the frontend interview flow
- Candidates are unaware of calibration
- No UI indicator for calibration progress

**Fix:** Add calibration phase UI component with progress bar. Backend sends `calibration_done: bool` flag.

---

## SECTION 8: Implementation Updates to FINAL_IMPLEMENTATION_PLAN.md

### 8.1 New/Updated Items

| Item | Priority | Change |
|------|----------|--------|
| Wire `ingest_security_features()` | **CRITICAL** | Add to Phase 0 (current: Phase 1) |
| Activate `WhitespaceFixationDetector` | **CRITICAL** | Add to Phase 0 (current: Phase 2) |
| Add ScamAI-inspired gaze features | HIGH | Add to Phase 1 |
| Fix PLR stimulus pipeline | **CRITICAL** | Add to Phase 0 (current: Phase 1) |
| Activate `ChallengeResponseDeepfake.jsx` | **CRITICAL** | Add to Phase 0 (current: Phase 2) |
| Wire `PlrChallenge.jsx` | HIGH | Add to Phase 0 (current: Phase 2) |
| Consolidate 3 fusion engines | MEDIUM | Keep in Phase 2 |
| WebGPU feasibility study | LOW | Add to Phase 7 |
| GenD model evaluation | MEDIUM | Add to Phase 2 |
| 90-second calibration UI | MEDIUM | Add to Phase 3 |
| L-R asymmetry + saccade velocity features | MEDIUM | Add to Phase 2 |

### 8.2 Revised Threat Priority Order

```
Phase 0 (Week 1-2) — CRITICAL Security Fixes — ADD:
  - Wire ingest_security_features() in hub.py
  - Activate WhitespaceFixationDetector with dynamic UI zones
  - Fix PLR stimulus_brightness pipeline  
  - Activate ChallengeResponseDeepfake.jsx
  - Wire PlrChallenge.jsx

Phase 1 (Week 3-4) — Biometric Pipeline — ADD:
  - ScamAI-inspired L-R asymmetry + saccade velocity features
  - Calibrate PLR thresholds from live data

Phase 2 (Week 5-8) — Research Innovations — ADD:
  - GenD model evaluation (server-side)
  - Consolidate fusion engines (3→1)
  - Document WebGPU migration path
```

---

## APPENDIX: Research Agent Credits

| Agent | Subtopic | Key Sources |
|-------|----------|-------------|
| Research Agent 1 | Cluely/overlay tools, OS compositor layers, behavioral detection, FabricHQ | Crunchbase, Cluely docs, macOS 15 Sequoia release notes, Codility blog, Zero Assist docs |
| Research Agent 2 | Whitspace fixation, PLR/rPPG, ScamAI 2026, UC Berkeley gaze study, MediaPipe | ScamAI (WACV 2026), UC Berkeley EECS technical report, multiple PLR studies (2019-2025), rPPG benchmarks |
| Research Agent 3 | GenD (WACV 2026), CAST, LipFD/SaVe, Manifest V3, WebGPU, regulatory | WACV 2026 proceedings, Chrome Platform Status, EU AI Act legislative tracker, NYC Law 144 enforcement records |
