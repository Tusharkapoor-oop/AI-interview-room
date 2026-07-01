# Product Requirements Document (PRD): Next-Gen AI Interview Platform

## 1. Vision and Scope
**Vision:** To build the world’s most advanced, visually stunning, and highly secure AI Interview ecosystem. We are moving beyond simple video recording to create a **premium, interactive, and gamified experience**. The platform will utilize multi-layered biometric anti-cheating defenses while offering a breathtaking UI/UX that WOWs candidates and recruiters alike.
**Scope:** A high-end web platform featuring Agentic AI interviewers, live pair-programming, and real-time 3D biometrics, built on a **globally distributed edge architecture** to support multi-lingual interviewing and strict international data sovereignty laws (GDPR, LGPD, PDPA).

## 2. Target Audience
- **Candidates:** Job seekers who expect a modern, premium, and flawless application experience.
- **Recruiters/Hiring Managers:** Professionals who need rich, interactive data visualizations and absolute confidence in assessment integrity.
- **System Administrators:** IT teams managing compliance and enterprise ATS integrations (Workday, Greenhouse).

## 3. Core Features & Advanced Functionality

### 3.1. Multimodal Anti-Cheating Engine (The Invisible Shield)
The platform deploys an unhackable, multi-layered anti-cheating framework (see [Biometric Security & Zero-Bypass Specification](file:///c:/Users/tusha/.gemini/antigravity-ide/scratch/ai-interview-platform/docs/7_Biometric_Security_Zero_Bypass_Spec.md) for full implementation details). It monitors candidates with high-accuracy biometric modeling:
- **Real-Time Gaze Tracking & Iris Heatmapping:** Leverages a 478-point 3D Face Mesh. Tracks vertical iris deviation ($>0.30$ units, ±1.5° accuracy) and horizontal deviation ($>0.35$ units, ±1.5° accuracy) alongside head rotation (SolvePnP head pitch/yaw ±2.0° and roll ±3.0°) to catch off-screen reading.
- **Kinematic Gesture Recognition:** MediaPipe-powered 21-point HandLandmarker tracking. Classifies hand count, phone-hold grip geometry (thumb-index pinch distance $<1.2\text{cm}$), earpiece contact (wrist-ear distance $<4.5\text{cm}$), writing gestures, and mouth covers (distance $<3.0\text{cm}$) at 30fps.
- **Voice Biometrics & Acoustic Analysis:** Detects AI-generated synthetic voice feeds, whispered coaching, and unnatural response-latency patterns.
- **Cognitive Fingerprinting:** Logs key dwell/flight times, typing rhythm changes, and mouse fluidity vectors to flag automation bots and remote access tools.
- **Challenge-Response Deepfake Prevention:** Randomized micro-gesture prompts (e.g., clicking on moving dots, turning head) that break real-time deepfake rendering pipelines.
- **Zero-Bypass Extension Firewall:** Utilizes a 10-vector security scan checking DOM selectors (80+ cheating apps), window globals, network overrides (blocking outbound fetch/XHR to OpenAI, Anthropic, Gemini, etc.), event trust verification (`e.isTrusted === true`), and ad-blocker timing attacks. Detection triggers immediate lockout overlays and fraud score penalties.

### 3.2. Agentic Conversational AI & Live Collaboration
- **Dynamic Context Generation:** The AI interviewer actively crawls the candidate's public GitHub, LinkedIn, or portfolio *during* the interview and formulates highly specific, unscripted questions on the fly.
- **AI Pair Programming:** The AI acts as a collaborative partner in a rich, integrated IDE, evaluating not just the final code, but the candidate's architectural decisions and communication skills while coding.
- **Bias-Masking Avatars:** Candidates have the option to be represented by a real-time, responsive 3D avatar that mirrors their expressions but masks their race, gender, and age, ensuring purely objective evaluations.

### 3.3. International Scale & Real-Time Localization
- **Hyper-Polyglot AI:** The AI natively understands and speaks 50+ languages. It flawlessly handles "code-switching" (e.g., mixing Hindi and English mid-sentence) and heavy regional accents without penalizing the candidate.
- **Live Translation Engine:** Candidates can interview in their native language (e.g., Japanese), while the Recruiter Dashboard automatically generates transcripts and summaries localized to the recruiter's language (e.g., English).
- **Graceful Internet Degradation:** For emerging markets with unstable connections, the platform seamlessly drops from high-fidelity 3D video to low-bandwidth 2D audio-only tracking while maintaining core biometric analysis locally on the candidate's device before batch-uploading.

### 3.4. Gamified Cognitive Assessments
- Incorporating neuroscience-based micro-games designed to assess risk tolerance, memory, and problem-solving under pressure without traditional "test anxiety." Completely culturally agnostic to ensure global fairness.

### 3.5. Premium Candidate & Recruiter Portals
- **Candidate Portal:** Features an interactive "Waiting Room" with AI mock-interview practice modes, system diagnostics visualized in sleek gauges, and a post-interview feedback portal.
- **Recruiter "Command Center":** A sci-fi inspired, rich data dashboard featuring 3D biometric waveform visualizations, timeline scrubbers with event flags, and one-click ATS syncing.

## 4. Non-Functional Requirements
- **Performance:** Ultra-low latency (<50ms) for AI voice responses and WebRTC video streaming globally, powered by Edge computing nodes.
- **Aesthetics:** The UI must adhere to modern premium design standards—utilizing Glassmorphism, tailored HSL dark mode palettes, and smooth micro-animations.
- **Global Compliance & Security:** End-to-end encryption, SOC 2 Type II compliance, zero-trust architecture. Data sovereignty logic automatically routes and stores European candidate data exclusively in EU data centers (GDPR), Brazilian data in LATAM (LGPD), etc.

## 5. User Stories
1. **As a Candidate**, I want to practice in a high-fidelity AI mock room before my real interview so I feel confident and accustomed to the premium interface.
2. **As a Recruiter**, I want to see a real-time 3D visualization of the candidate's cognitive fingerprint and trust score, so I can instantly verify their authenticity without scrubbing through hours of video.
3. **As an Engineering Manager**, I want the AI to pull a candidate's recent open-source commit and ask them to explain their logic, ensuring they actually wrote the code.
