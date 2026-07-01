# UI & UX Design Flow: Premium AI Interview Platform

## 1. Design Aesthetic & Philosophy
The platform will utilize a **"Cyber-Premium" design language** to WOW the user. We are abandoning boring, clinical corporate interfaces.
- **Glassmorphism:** Frosted glass panels over deep, rich background meshes.
- **Color Palette:** A highly curated dark mode by default. Deep oceanic blues (`#0B132B`), rich glowing indigos (`#4361EE`), and vibrant neon accents for micro-interactions (Cyan `#4CC9F0` and Magenta `#F72585`).
- **Typography:** Modern, highly legible sans-serifs (e.g., *Outfit* for headers, *Inter* for data and code).
- **Micro-Animations:** Every interaction feels alive. Buttons have subtle magnetic hover states, data transitions smoothly with easing functions, and waveforms react in real-time to audio input.

## 2. Candidate Interface: The Immersive Arena

### 2.1. The Digital Lobby (Localized Onboarding)
- **Visuals:** A sleek, dark-themed lobby with a slow-moving, abstract fluid mesh background. The UI automatically localizes text direction (RTL/LTR), date formats, and currencies.
- **Adaptive Bandwidth UI:** If the connection drops below 5Mbps, a sleek prompt appears: *"Low connection detected. Switching to Edge-Compute Mode to preserve interview quality."* The complex 3D meshes degrade gracefully into elegant 2D Glassmorphic panes to save battery and bandwidth.
- **Interactive Diagnostics:** Instead of standard text boxes, the hardware check features dynamic circular progress rings that glow green as camera, mic, and connection are verified.
- **Deepfake Liveness Game:** The liveness check is framed in a sleek, glowing border. As the candidate follows the on-screen prompts (e.g., looking at a specific quadrant), the border lights up sequentially. It feels like unlocking a high-tech vault, not taking a polygraph.

### 2.2. The Interview Console
- **Visuals:** A distraction-free, cinematic layout.
  - **The Interviewer:** A high-fidelity real-time waveform that pulses intelligently with the AI's speech, or a hyper-realistic MetaHuman avatar (candidate's choice).
  - **The Canvas:** The right side of the screen elegantly transitions between a beautifully syntax-highlighted IDE (Monaco Editor with custom glowing themes), an interactive whiteboard, and immersive spatial reasoning mini-games.
- **Subtle Security Alerts (5-12 Second Pop-ups):** The anti-cheating tracking operates invisibly in the background. If a minor violation occurs (e.g., candidate looks away too long), a soft, frosted-glass toast notification slides in smoothly: *"We lost your gaze! Please look back at the screen."* These pop-ups are **strictly ephemeral—they display for 5 to 12 seconds and then automatically disappear** so the candidate isn't permanently distracted.
- **Live Collaboration:** When the AI pair-programs, its cursor appears in the IDE with a smooth, glowing trail, typing out suggestions collaboratively.

## 3. Recruiter Dashboard: The Command Center

### 3.1. The Talent Grid
- **Visuals:** A striking dashboard utilizing frosted glass cards floating over a subtle dark background.
- **Data Representation:** Candidates are represented by sleek profile cards. The "Trust & Integrity" score is represented by a beautiful, glowing circular gauge. A score of 98 glows a vibrant cyan, while a score of 45 pulses a warning amber/red.
- **Hover Effects:** Hovering over a candidate card instantly plays a silent, 3-second animated GIF summary of their interview.

### 3.2. Deep Dive Forensics (The Global God-Mode View)
- **Visuals:** A rich, multi-pane analytics powerhouse with automatic timezone conversion linking candidate local time to recruiter local time.
- **Video & Translated Transcript:** Left pane features the video player synchronized with the transcript. A toggle allows the recruiter to instantly switch between the candidate's native spoken language and the translated recruiter language. The transcript automatically highlights sentences in red if the Semantic NLP flags them as highly likely to be LLM-generated.
  - **The Biometric Visualizer (3D):** The top-right pane features a WebGL/Three.js 3D rotating globe or radar chart representing the candidate's "Cognitive Fingerprint" (combining typing rhythm, gaze stability, and vocal stress).
  - **The Timeline Scrubber (Permanent Data Store):** Unlike the candidate view where alerts disappear, **the Admin View permanently stores and displays ALL telemetry data.** A sleek horizontal scrubber at the bottom shows every single 5-12 second candidate pop-up as a permanent, clickable glowing spike on a waveform.
    - Clicking an anomaly spike (e.g., "Device Detected at 14:02") smoothly transitions the video player directly to that millisecond, displaying the exact detailed data payload (duration, confidence score, bounding box) that triggered the alert.
- **Action Pane:** A sleek, floating glass panel at the bottom right with primary actions: *Advance*, *Reject*, *Schedule Follow-up*, or *Sync to Workday*.

## 4. Real-Time Animations & Feedback
- **Skeleton Loaders:** All data loading utilizes shimmering skeleton screens to maintain immersion.
- **Success States:** Approving a candidate triggers a satisfying, celebratory micro-animation (e.g., a burst of subtle confetti or a glowing confirmation ring).
- **Accessibility:** High-contrast toggles, reduce-motion settings, and robust screen-reader support are seamlessly integrated into a dedicated, beautifully designed settings modal.
