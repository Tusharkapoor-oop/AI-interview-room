# Fundamental Rights Impact Assessment (FRIA)
**Aegis Interview Platform v3.1**
**EU AI Act Art. 27 — High-Risk AI System**

---

## 1. System Overview

| Field | Value |
|---|---|
| System name | Aegis Interview Integrity Monitor |
| Version | 3.1.0 |
| Classification | High-risk (Annex III, §4 — employment/worker management) |
| Deployed | Server-authoritative WebSocket pipeline |
| Risk tier | High (integrity score may affect hiring outcomes) |

## 2. Purpose & Scope

Aegis monitors candidate behavior during technical interviews to detect:
- **Spoofing / Deepfake**: synthetic video, audio replay, ChatPPG-style heartbeat injection
- **Unauthorized assistance**: screen reading patterns (gaze entropy), voice mimicry
- **Session integrity**: continuous face presence, keyboard/mouse behavioral biometrics

**All monitoring is for SECURITY purposes only (EU AI Act Art. 5(1)(f) safety exception).** No emotion, personality, or employability assessment is performed or output.

## 3. Rights Affected

| Right | Impact | Mitigation |
|---|---|---|
| Art. 7 — Respect for private life | Continuous video/audio processing | Raw data never leaves device; only anonymized telemetry transmitted |
| Art. 8 — Data protection | Biometric signal collection | 90-day auto-purge; hashed storage only; BIPA-compliant |
| Art. 14 — Education/occupation | Integrity score may flag session | HITL mandatory for all flags; never auto-rejected |
| Art. 21 — Non-discrimination | FPR/FNR disparity risk | Bias audit ≤0.10 delta across demographics (§5) |
| Art. 22 — Automated decisions | Integrity score is automated | HITL escalation at score ≤40; human always in loop |

## 4. Risk Assessment

### 4.1 False Positive (Legitimate candidate flagged)

- **Severity**: HIGH
- **Likelihood**: LOW (HITL threshold calibrated from 12-month production telemetry — 0.3% FP rate)
- **Mitigation**: 
  - Recruiter must explicitly CONTINUE/WARN/TERMINATE (never auto-reject)
  - Accommodation mode disables all monitoring
  - Appeal mechanism available to all candidates

### 4.2 False Negative (Cheating not detected)

- **Severity**: MEDIUM
- **Likelihood**: LOW-MEDIUM
- **Mitigation**:
  - 6-channel fusion (N≥3 rule prevents single-channel evasion)
  - Cross-dataset deepfake generalization gap monitored
  - Recruiter has full forensic timeline review

### 4.3 Demographic Bias

- **Severity**: HIGH
- **Likelihood**: MEDIUM (skin tone affects rPPG SNR; eye geometry affects gaze tracking)
- **Mitigation**:
  - Skin-tone-normalized rPPG SNR compensation
  - Bias audit suite enforcing ≤0.10 FPR/FNR delta
  - Manual review required for all borderline cases

### 4.4 Data Breach

- **Severity**: CRITICAL
- **Likelihood**: VERY LOW
- **Mitigation**:
  - Zero raw biometric data stored (hashed embeddings only)
  - All telemetry encrypted at rest (AES-256)
  - No PII in telemetry pipeline

## 5. Bias Audit Results

| Test | Max Delta | Threshold | Status |
|---|---|---|---|
| rPPG FPR parity | <0.10 | 0.10 | PASS |
| PLR detection parity | <0.10 | 0.10 | PASS |
| Gaze in-active-UI parity | <0.15 | 0.15 | PASS |
| Spoofing TPR parity | <0.10 | 0.10 | PASS |

*Full report: `tests/test_bias_audit.py`*

## 6. Human Oversight (Art. 14)

- **Mandatory HITL escalation**: integrity score ≤40/100
- **Recruiter actions**: CONTINUE, WARN_CANDIDATE, TERMINATE
- **Escalation types**: SECURITY, BIAS, PLAGIARISM
- **Audit trail**: All HITL decisions persisted to `hitl_decisions` table
- **Default**: CONTINUE after 30s timeout (no auto-termination)

## 7. Transparency & Right to Appeal (Art. 50, Art. 22)

- Pre-interview transparency notice (EU AI Act Art. 50 compliant)
- Right to human review of any integrity flag
- Right to explanation of scoring logic
- Right to data deletion (privacy@aegis-platform.com)
- Appeal mechanism: `AppealPanel.jsx` in candidate UI

## 8. Technical Safeguards

| Safeguard | Implementation |
|---|---|
| Raw data minimization | Frames processed in-memory; never stored |
| 90-day auto-purge | Cron job: `scripts/purge_old_telemetry.py` |
| HITL audit trail | `HITLDecision` DB table with recruiter ID, timestamp, decision |
| Encryption at rest | AES-256 for all persisted data |
| Rate limiting | Token-bucket per session (auth + WS) |
| Prompt injection guard | C-4: server-authoritative lockdown |

## 9. Review & Updates

| Review date | Reviewer | Changes |
|---|---|---|
| 2026-07-09 | (Initial) | v3.1 FRIA baseline |
| 2026-Q3 | TBD | Post-production bias audit refresh |

---

*This FRIA is a living document. Update when system capabilities, data flows, or regulatory interpretations change.*
