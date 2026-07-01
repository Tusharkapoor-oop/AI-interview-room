# 🏛️ DOCUMENT 8: THE MANDATORY EDGE — TECHNICAL BLUEPRINT
**Integrating Gaze and Pupil Response in a Fail-Closed AI Interview Proctoring System**
*Classification: Architecture & Engineering Core Specification // Version 3.0 FINAL*

---

## 1. Architectural Foundation for Mandatory Compliance
The implementation of a mandatory dual-modal biometric system hinges on an architectural design that makes proctoring an **inseparable and non-disruptable component of the interview experience itself**. This is not achieved through simple software flags but through a deeply integrated, **fail-closed framework** where the proctoring logic runs on the client-side, directly within the browser environment.

### 1.1 Client-Side WebGPU & WebAssembly Acceleration
The primary technical enabler for this mandatory architecture is the use of **WebAssembly (Wasm)** and **WebGPU** for client-side inference. These technologies allow developers to compile high-performance machine learning models (written in C++ or Python) into a format that runs at near-native speed inside a web browser.
* **Latency Target:** Real-time CV inference operates with **< 200ms latency** on the client side.
* **Hardware Acceleration:** WebGPU accelerates ML workloads by over **30x compared to CPU-based Wasm**, enabling real-time processing of high-resolution video streams at **30+ FPS**.
* **Sandboxed Bundling:** The entire proctoring engine—including models for face landmark detection (`face_landmarker.task`), gaze estimation, and pupil diameter tracking—is bundled with the frontend package and executed within the client's local sandbox.

### 1.2 The Fail-Closed State Machine
Because the CV engine is integral to application runtime, its failure directly impacts the user experience:
* If the engine crashes, becomes unresponsive, or drops below the safe threshold (**< 15 FPS**), the main thread immediately triggers a predefined **Fail-Closed Action**.
* **Zero-Permissiveness:** In any state of uncertainty, network degradation (< 5 Mbps upload or > 100ms jitter), or webcam disconnect, the application freezes the interview session, renders a critical security warning, and logs a tamper event.

---

## 2. Implementation of Real-Time Gaze Tracking
Real-time gaze tracking captures voluntary eye movements indicative of attention, distraction, or deception.

### 2.1 The 468-Point Landmark & Pupil Pipeline
1. **Face & Eye Detection:** **MediaPipe Face Mesh** detects **468 3D landmarks** in real time, isolating stable ocular bounding boxes.
2. **Pupil Center Localization:** Deep learning segmentation models accurately locate the pupil center pixel coordinate $(x, y)$ within the cropped eye image under varying home-office lighting.
3. **Head Pose Estimation:** Perspective-n-Point (PnP) geometry computes 3D Euler angles (**Pitch, Yaw, Roll**) to correct for head movement and isolate true eyeball rotation.
4. **Point-of-Gaze (PoG) Calibration:** A guided onboarding calibration trains a weighted least squares regression matrix mapping normalized eye/head vectors directly to viewport $(X, Y)$ screen coordinates.

---

## 3. Pupillary Light Reflex (PLR) & rPPG Analysis
The second mandatory modality, **Pupillary Light Reflex (PLR)**, measures involuntary autonomic nervous system responses to controlled visual stimuli, rendering static spoofing attacks obsolete.

### 3.1 Stimulus Presentation & High-Frequency Pupillometry
* **Controlled Illumination:** The application programmatically alters screen canvas brightness at calibrated intervals ($0.5 - 2.0\text{ Hz}$).
* **Temporal Tracking:** The pipeline samples pupil radius at **> 60 Hz**, filtering noise to extract the four core diagnostic parameters:
  1. **Latency:** Time delay between light onset and constriction start ($200 - 300\text{ms}$).
  2. **Constriction Velocity:** Peak rate of diameter decrease.
  3. **Amplitude:** Total change from resting baseline diameter to full constriction.
  4. **Recovery Time:** Duration required to return to baseline dilation.
* **rPPG Blood Volume Pulse:** Simultaneously performs a $30\text{ Hz}$ Discrete Fourier Transform (DFT) across the facial green channel to measure cardiac pulse ($50 - 160\text{ BPM}$).

---

## 4. Integrated Dual-Modal Fusion Logic
The system enforces a correlation-based anomaly detector hunting for the signature of remote cheating:

### 4.1 The "Off-Screen Gaze + Absent PLR" Signature
* **Behavioral Trigger:** If the gaze vector indicates off-screen regard (e.g., top-right corner or secondary monitor) for **> 3 seconds**, a low-level alert triggers.
* **Physiological Confirmation:** If the screen background remains brightly lit but the candidate's pupil remains dilated (showing no PLR constriction), the engine confirms the candidate is viewing an un-illuminated external display or physical notes.
* **Action:** Immediate **High-Confidence Violation** logged and session escalated or terminated.

### 4.2 Liveness & Presentation Attack Detection (ISO/IEC 30107-3 PAD)
* **Static Photo / Replay Attack:** Pupil remains fixed despite screen illumination flashes $\rightarrow$ **Critical Lockdown**.
* **3D Mask Attack:** Micro-saccades absent and PLR dynamics mismatch ambient lighting $\rightarrow$ **Critical Lockdown**.

---

## 5. System Architecture & Recruiter Command Center

### 5.1 Hybrid Edge-Cloud Telemetry Pipeline
* **Edge Inference:** Client browser runs WebGPU models locally, serializing telemetry into Protobuf/MessagePack compressed JSON payloads sent over WebSockets (`/ws/v1/telemetry` or `/ws/cv`) at **< 50 KB/s**.
* **Persistence:** TimescaleDB / InfluxDB stores high-frequency biometric time series; PostgreSQL stores session metadata and risk flags; Vector DB stores hashed facial embeddings.

### 5.2 Recruiter Command Center (Ghost View)
* **Left 70% Video Player:** Features toggleable **Ghost View** overlay rendering real-time SVG skeletal circles, 468 mesh points, and directional gaze vectors directly over the candidate video.
* **Right 30% Behavior Timeline:** Scrubable multi-layered timeline displaying spatial gaze heatmaps, head pose graphs, and audio anomaly spectrograms. Clicking any red **Risk Flag** jumps the video directly to the exact timestamp of infraction.
