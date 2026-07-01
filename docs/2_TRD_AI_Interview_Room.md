# Technical Requirements Document (TRD): Next-Gen AI Interview Platform

## 1. System Architecture

The platform architecture is upgraded to support real-time 3D rendering, live bidirectional coding collaboration, and dynamic Web Crawler agents.

### 1.1. High-Level Components
- **Frontend Application (Client):** 
  - Developed in **Next.js (React 18)** for optimal SSR and routing.
  - **WebGL / Three.js** engine integrated to render real-time 3D Biometric Visualizers and MetaHuman AI Avatars in the browser.
  - **Monaco Editor** integrated for the live Pair-Programming IDE.
- **Backend API Gateway & WebSocket Servers:** 
  - Node.js (NestJS) microservices to handle ultra-low latency WebSocket connections (essential for live pair programming and avatar lip-syncing).
- **Agentic AI & Crawler Nodes:** 
  - Python-based background workers equipped with LangChain and Playwright to autonomously scrape candidate GitHub repositories and construct contextual interview questions prior to the session.
- **Global Edge Network (CDN & WebRTC):** 
  - Distributed WebRTC TURN/STUN servers deployed via Cloudflare or AWS Global Accelerator. Ensures sub-50ms connection latency whether a candidate connects from Mumbai, Berlin, or San Francisco.
- **Computer Vision (CV) Inference Nodes:** 
  - FastAPI services running MediaPipe for gaze/gesture tracking, localized to the nearest geographical data center to minimize inference round-trip times.
- **Audio & NLP Pipeline:** 
  - Whisper API for real-time STT, fused with LLM integration (GPT-4o / Claude 3.5 Sonnet) for dynamic, sub-500ms conversational responses.

## 2. Hardware and Software Requirements

### 2.1. Client Requirements (Candidate Side)
- **Device:** Desktop or Laptop computer strongly recommended for the immersive IDE and 3D rendering experience.
- **Browser:** Hardware Acceleration MUST be enabled in Chrome/Edge/Firefox to support Three.js and WebGL avatars smoothly.
- **Network:** Minimum 10 Mbps for stable bidirectional WebRTC video and real-time state synchronization.

### 2.2. Server/Cloud Infrastructure
- **GPU Inference Clusters (Multi-Region):** AWS G5 instances (NVIDIA A10G) deployed in active-active configurations across US-East, EU-Central, and AP-South to handle real-time TTS and MediaPipe processing locally.
- **Data Sovereignty Lakes:** Sharded databases ensuring strict data residency (e.g., EU candidate data never leaves AWS `eu-central-1`).
- **ATS Integration Layer:** Dedicated microservice for bi-directional syncing with enterprise ATS platforms (Workday, Greenhouse, Lever) via REST/GraphQL APIs.

## 3. Advanced Technology Stack & Benchmarks

### 3.1. The Agentic AI Interviewer
- **Latency Benchmark:** The entire loop—Candidate speaks -> Whisper STT -> LLM prompt generation -> TTS generation -> Avatar lip-sync playback—must occur in **under 800ms** to feel conversational.
- **Bias-Masking Engine:** Candidates can opt to run the video feed through a real-time Generative Adversarial Network (GAN) that masks their appearance into a standardized avatar, while preserving underlying facial micro-expressions for the emotion-tracking baseline.

### 3.2. Real-Time Telemetry & Cognitive Fingerprinting
- **WebSockets Protocol:** Keystrokes, mouse fluidity, and code execution outputs in the live IDE are broadcasted via WebSockets (e.g., Socket.io) to the backend forenscis engine.
- **3D Visualization:** The backend aggregates this telemetry and generates a normalized multi-dimensional array. The React frontend consumes this array to render a beautiful, spinning WebGL radar chart that recruiters can interact with in real-time.

## 4. Security, Compliance, and Enterprise Integration

### 4.1. Global Security Protocols
- **Strict Data Residency:** To comply with GDPR, CCPA, and PDPA, the database utilizes region-tagging. The bias-masking avatar features ensure that raw video data of the candidate's actual face does not need to be stored long-term; only behavioral telemetry vectors are retained locally in the candidate's sovereign region.
- **Zero-Trust Access:** Recruiter dashboards are protected by SSO (Okta, Azure AD) and require MFA.

### 4.2. Deepfake Resistance
- **Continuous Validation:** The platform randomly injects sub-second visual artifacts or requires physical interactions (e.g., "Click the blue dot on the screen") that break Real-Time Deepfake (RTDF) processing pipelines by forcing non-standard rendering conditions.

### 4.3. Aegis Zero-Bypass Extension Firewall & Threat Mitigation
To counter extensions running in the shared browser script context (which bypass standard sandbox rules by reading page source, copying clipboard states, and overlaying cheat interfaces), the system enforces a 10-vector security layer:
1. **DOM Fingerprinting:** Scans main page and open Shadow DOM boundaries every 2.0s for 80+ CSS signatures of AI/cheating extensions.
2. **API Surface Checks:** Inspects the `window` namespace for injected properties (e.g., `window.tampermonkey`, `window.GM`).
3. **Prototype Network Patching:** Replaces standard `window.fetch` and `XMLHttpRequest.prototype.open` to monitor and intercept outbound API payloads to AI domains (e.g., OpenAI, Claude, Gemini, Perplexity) before they leave the tab context.
4. **Input Trust Audits:** Rejects any keyboard or text field updates where `event.isTrusted !== true` (blocking Selenium, Puppeteer, and extension autocompletions).
5. **Ad-Blocker Timing Attack:** Detects blocker extensions by requesting a fake ad resource (`/ads/ad.js`) and analyzing the rejection timing. Rejection in $<10\text{ms}$ flags telemetry-blocking tools like uBlock Origin.
6. **CSS Injection Auditing:** Periodically parses `document.styleSheets` looking for stylesheets sourced from `chrome-extension://` or `moz-extension://`.
7. **Storage State Validation:** Computes rolling hashes of `localStorage` every 10s to detect external session reading.
8. **Iframe & Worker Scans:** Resolves service worker registration states and checks iframes for extension sources.
9. **Strict Fullscreen Lock:** Automatically blocks the screen on any focus loss or fullscreen escape, requiring immediate manual click-to-resume.
10. **Synthetic Clipboard Guard:** Intercepts copy/paste events and verifies physical event dispatch status.

*For complete catalog parameters, see [Biometric Security & Zero-Bypass Specification](file:///c:/Users/tusha/.gemini/antigravity-ide/scratch/ai-interview-platform/docs/7_Biometric_Security_Zero_Bypass_Spec.md).*
