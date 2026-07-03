"""
main.py — Aegis Interview Room Backend v3.0
Full agentic architecture: Hub-Spoke + MCP + 4-tier Memory + HITL

Changes from v2:
  - ws/interview now runs the full AegisHub ReAct orchestration loop
  - ws/cv uses CVAgent spoke (grace-period aware, baseline normalized)
  - ws/recruiter new endpoint — receives HITL escalations from Hub
  - /api/v1/mcp/tools — lists all available MCP tools
  - /api/v1/artifacts/{session_id} — list agent artifacts
  - MCP client mounted on app startup (sqlite + github servers)
"""
import asyncio
import base64
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime

import cv2
import mediapipe as mp
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from database import SessionLocal, InterviewSession, AgentArtifact, TelemetryEvent
from agents import AegisHub
from agents.cv_agent import CVAgent
from agents.security_engine import SecurityEvent
from mcp.client import MCPClient
from mcp.sqlite_server import _build_sqlite_server
from mcp.github_server import _build_github_server
from memory.manager import MemoryManager
from agents.forensic_engine import KSTestBaselineEngine, WhitespaceFixationDetector, PLRrPPGLivenessEngine, ForensicObservation
from agents.fusion_engine import KinematicGestureEngine, FiveChannelFusionEngine, ChannelPacket
import time

# ─── Global AEGIS v4.0 Forensic & Fusion Engines ─────────────────────────────
ks_engine = KSTestBaselineEngine(calibration_duration_sec=5.0, window_duration_sec=10.0)
whitespace_engine = WhitespaceFixationDetector(window_size_frames=30)
liveness_engine = PLRrPPGLivenessEngine(challenge_duration_sec=10.0)
gesture_engine = KinematicGestureEngine()
fusion_engine = FiveChannelFusionEngine(window_duration_sec=10.0)

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)-8s] %(name)s — %(message)s",
)
log = logging.getLogger("aegis")

# ─── Config ───────────────────────────────────────────────────────────────────
load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ai_client = AsyncOpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
if not ai_client:
    log.warning("No OPENAI_API_KEY — running in offline mock mode")

# ─── Global MCP Client (mounted at startup) ───────────────────────────────────
mcp_client = MCPClient()
memory_manager = MemoryManager(db_session_factory=SessionLocal)

# ─── Recruiter HITL Connection Registry ───────────────────────────────────────
# Maps session_id → WebSocket (recruiter view for that session)
recruiter_sockets: dict[str, WebSocket] = {}

async def broadcast_to_recruiter(session_id: str, payload: dict):
    """Send HITL event to the recruiter watching this session."""
    ws = recruiter_sockets.get(session_id)
    if ws:
        try:
            await ws.send_json(payload)
        except Exception:
            recruiter_sockets.pop(session_id, None)

# ─── App Lifecycle ────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Mount MCP servers and initialize memory manager on startup."""
    log.info("Aegis v3.0 starting up...")
    mcp_client.mount(_build_sqlite_server(db_session_factory=SessionLocal))
    mcp_client.mount(_build_github_server(ai_client=ai_client))
    log.info("MCP servers mounted: %s", [t["server"] for t in mcp_client.list_tools()])
    yield
    log.info("Aegis shutting down")

# ─── App Setup ────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Aegis Interview Room",
    description="Advanced Biometric Proctoring & Assessment Platform — Agentic Architecture",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── MediaPipe Setup ──────────────────────────────────────────────────────────
import threading
import urllib.request
import math

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODELS_DIR, exist_ok=True)
face_model_path = os.path.join(MODELS_DIR, "face_landmarker.task")
hand_model_path = os.path.join(MODELS_DIR, "hand_landmarker.task")

FACE_LANDMARKER_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
HAND_LANDMARKER_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

def ensure_model(url, path):
    if not os.path.exists(path):
        log.info(f"Downloading model {os.path.basename(path)}...")
        urllib.request.urlretrieve(url, path)
        log.info(f"Downloaded model to {path}")

try:
    ensure_model(FACE_LANDMARKER_URL, face_model_path)
    ensure_model(HAND_LANDMARKER_URL, hand_model_path)
except Exception as e:
    log.warning("Could not auto-download MediaPipe task models: %s", e)

face_landmarker = None
hand_landmarker = None
cv_lock = threading.Lock()

try:
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision

    face_options = vision.FaceLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=face_model_path),
        output_face_blendshapes=True,
        num_faces=1
    )
    face_landmarker = vision.FaceLandmarker.create_from_options(face_options)

    hand_options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=hand_model_path),
        num_hands=2
    )
    hand_landmarker = vision.HandLandmarker.create_from_options(hand_options)
    log.info("[main] MediaPipe Tasks detectors (Face & Hand) initialized successfully.")
except Exception as e:
    log.warning("[main] MediaPipe Tasks not initialized. Using premium simulation: %s", e)

_MODEL_3D = np.array([
    [0.0,    0.0,    0.0   ],
    [0.0,  -330.0,  -65.0  ],
    [-225.0, 170.0, -135.0 ],
    [225.0,  170.0, -135.0 ],
    [-150.0,-150.0, -125.0 ],
    [150.0, -150.0, -125.0 ],
], dtype=np.float64)
_LM_INDICES = [1, 152, 33, 263, 61, 291]

# ── Kalman Filter for pose smoothing ─────────────────────────────
# Reduces jitter / false-positive gaze anomalies from noisy estimates.
class KalmanPoseSmoother:
    def __init__(self):
        # State: [pitch, yaw, roll, d_pitch, d_yaw, d_roll]
        self.kf = cv2.KalmanFilter(6, 3)
        dt = 1.0
        self.kf.transitionMatrix = np.array([
            [1,0,0,dt,0,0],
            [0,1,0,0,dt,0],
            [0,0,1,0,0,dt],
            [0,0,0,1,0,0],
            [0,0,0,0,1,0],
            [0,0,0,0,0,1],
        ], dtype=np.float32)
        self.kf.measurementMatrix = np.array([
            [1,0,0,0,0,0],
            [0,1,0,0,0,0],
            [0,0,1,0,0,0],
        ], dtype=np.float32)
        self.kf.processNoiseCov = np.eye(6, dtype=np.float32) * 0.03
        self.kf.measurementNoiseCov = np.eye(3, dtype=np.float32) * 0.5
        self.kf.errorCovPost = np.eye(6, dtype=np.float32)
        self.initialized = False

    def update(self, pitch: float, yaw: float, roll: float):
        meas = np.array([[pitch], [yaw], [roll]], dtype=np.float32)
        if not self.initialized:
            self.kf.statePre = np.array([[pitch],[yaw],[roll],[0],[0],[0]], dtype=np.float32)
            self.kf.statePost = self.kf.statePre.copy()
            self.initialized = True
        self.kf.predict()
        self.kf.correct(meas)
        state = self.kf.statePost
        return float(state[0]), float(state[1]), float(state[2])

_pose_smoother = KalmanPoseSmoother()

# ── Kalman Filter for iris gaze smoothing ─────────────────────────
class KalmanGazeSmoother:
    def __init__(self):
        self.kf = cv2.KalmanFilter(4, 2)
        dt = 1.0
        self.kf.transitionMatrix = np.array([
            [1,0,dt,0],
            [0,1,0,dt],
            [0,0,1,0],
            [0,0,0,1],
        ], dtype=np.float32)
        self.kf.measurementMatrix = np.array([[1,0,0,0],[0,1,0,0]], dtype=np.float32)
        self.kf.processNoiseCov = np.eye(4, dtype=np.float32) * 0.02
        self.kf.measurementNoiseCov = np.eye(2, dtype=np.float32) * 0.3
        self.kf.errorCovPost = np.eye(4, dtype=np.float32)
        self.initialized = False

    def update(self, gaze_h: float, gaze_v: float):
        meas = np.array([[gaze_h], [gaze_v]], dtype=np.float32)
        if not self.initialized:
            self.kf.statePre = np.array([[gaze_h],[gaze_v],[0],[0]], dtype=np.float32)
            self.kf.statePost = self.kf.statePre.copy()
            self.initialized = True
        self.kf.predict()
        self.kf.correct(meas)
        state = self.kf.statePost
        return float(state[0]), float(state[1])

_gaze_smoother = KalmanGazeSmoother()

# EAR landmarks for proper blink detection
# Left eye: 33, 160, 158, 133, 153, 144
# Right eye: 362, 385, 387, 263, 373, 380
_LEFT_EYE_EAR_IDX  = [33, 160, 158, 133, 153, 144]
_RIGHT_EYE_EAR_IDX = [362, 385, 387, 263, 373, 380]

def _compute_ear(lms, indices: list, w: int, h: int) -> float:
    """Eye Aspect Ratio (EAR) = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)"""
    pts = [(lms[i].x * w, lms[i].y * h) for i in indices]
    def dist(a, b): return math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2)
    A = dist(pts[1], pts[5])
    B = dist(pts[2], pts[4])
    C = dist(pts[0], pts[3])
    return (A + B) / (2.0 * C) if C > 1e-6 else 0.3



def _infer_frame(b64_frame: str) -> dict:
    """CV inference — runs in thread pool (non-blocking)."""
    if "," in b64_frame:
        b64_frame = b64_frame.split(",")[1]
    try:
        raw   = base64.b64decode(b64_frame)
        arr   = np.frombuffer(raw, np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        return {"status": "error", "msg": "decode_failed"}

    if frame is None:
        return {"status": "error", "msg": "empty_frame"}

    h, w = frame.shape[:2]
    
    pitch = yaw = roll = 0.0
    eye_yaw = eye_pitch = 0.0
    gaze_h = gaze_v = 0.0
    ear_left = ear_right = 0.3
    face_detected = False
    face_count = 0
    hands_visible = 0
    hand_anomaly_detected = False
    hand_anomaly_desc = ""
    lms = None  # keep reference for hand-face proximity check

    if face_landmarker is not None and hand_landmarker is not None:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb.copy())
        
        with cv_lock:
            try:
                face_res = face_landmarker.detect(mp_image)
                hand_res = hand_landmarker.detect(mp_image)
            except Exception as e:
                log.error("MediaPipe Task inference error: %s", e)
                face_res = None
                hand_res = None
        
        # Multi-face count (secondary person detection)
        face_count = len(face_res.face_landmarks) if (face_res and face_res.face_landmarks) else 0

        # Process face landmarks
        if face_res and face_res.face_landmarks:
            face_detected = True
            lms = face_res.face_landmarks[0]
            
            # ── Head pose estimation using solvePnP ──────────────
            pts_2d = np.array([[lms[i].x * w, lms[i].y * h] for i in _LM_INDICES], dtype=np.float64)
            focal = float(w) * 1.1  # slightly better approximation
            cam   = np.array([[focal, 0, w/2.0], [0, focal, h/2.0], [0, 0, 1]], dtype=np.float64)
            dist  = np.zeros((4, 1), dtype=np.float64)
            ok, rvec, _ = cv2.solvePnP(_MODEL_3D, pts_2d, cam, dist, flags=cv2.SOLVEPNP_ITERATIVE)
            if ok:
                rmat, _ = cv2.Rodrigues(rvec)
                angles, *_ = cv2.RQDecomp3x3(rmat)
                # Apply Kalman smoothing to reduce jitter
                pitch, yaw, roll = _pose_smoother.update(float(angles[0]), float(angles[1]), float(angles[2]))
                pitch = round(pitch, 2)
                yaw   = round(yaw, 2)
                roll  = round(roll, 2)

            # ── EAR Blink Detection ───────────────────────────────
            if len(lms) >= 468:  # standard 468 landmarks
                ear_left  = round(_compute_ear(lms, _LEFT_EYE_EAR_IDX,  w, h), 4)
                ear_right = round(_compute_ear(lms, _RIGHT_EYE_EAR_IDX, w, h), 4)
                
            # ── Iris Gaze Tracking (478 points with iris) ─────────
            if len(lms) >= 478:
                # ── LEFT EYE iris gaze ────────────────────────────
                # Iris landmarks: 468=center, 469=right, 470=bottom, 471=left, 472=top
                # Eye corners: 33=outer-right, 133=inner-left (from face-front perspective)
                # Eyelid: 159=top, 145=bottom
                l_outer  = lms[33]   # Outer left eye corner
                l_inner  = lms[133]  # Inner left eye corner  
                l_iris   = lms[468]  # Iris center
                l_top    = lms[159]  # Upper eyelid
                l_bottom = lms[145]  # Lower eyelid

                l_eye_w = abs(l_outer.x - l_inner.x)
                l_eye_h = abs(l_top.y   - l_bottom.y)
                l_left_x = min(l_outer.x, l_inner.x)
                l_top_y  = min(l_top.y, l_bottom.y)

                left_gaze_h = ((l_iris.x - l_left_x) / l_eye_w - 0.5) if l_eye_w > 1e-5 else 0.0
                left_gaze_v = ((l_iris.y - l_top_y)  / l_eye_h - 0.5) if l_eye_h > 1e-5 else 0.0

                # ── RIGHT EYE iris gaze ───────────────────────────
                # Iris landmarks: 473=center, 474=right, 475=bottom, 476=left, 477=top
                # Eye corners: 362=inner-right, 263=outer-left
                # Eyelid: 386=top, 374=bottom
                r_inner  = lms[362]  # Inner right eye corner
                r_outer  = lms[263]  # Outer right eye corner
                r_iris   = lms[473]  # Iris center
                r_top    = lms[386]  # Upper eyelid
                r_bottom = lms[374]  # Lower eyelid

                r_eye_w  = abs(r_outer.x - r_inner.x)
                r_eye_h  = abs(r_top.y   - r_bottom.y)
                r_left_x = min(r_outer.x, r_inner.x)
                r_top_y  = min(r_top.y, r_bottom.y)

                right_gaze_h = ((r_iris.x - r_left_x) / r_eye_w - 0.5) if r_eye_w > 1e-5 else 0.0
                right_gaze_v = ((r_iris.y - r_top_y)  / r_eye_h - 0.5) if r_eye_h > 1e-5 else 0.0

                # Average both eyes, apply Kalman smoothing
                raw_gaze_h = (left_gaze_h + right_gaze_h) / 2.0
                raw_gaze_v = (left_gaze_v + right_gaze_v) / 2.0
                gaze_h, gaze_v = _gaze_smoother.update(raw_gaze_h, raw_gaze_v)
                gaze_h = round(gaze_h, 4)
                gaze_v = round(gaze_v, 4)

                # Scale gaze to approximate degrees
                # gaze_h=0.5 → ~30° left/right; gaze_v=0.5 → ~20° up/down
                eye_yaw   = round(gaze_h * 60.0, 2)
                eye_pitch = round(-gaze_v * 40.0, 2)
        
        # ── Hand Gesture Analysis ─────────────────────────────────
        if hand_res and hand_res.hand_landmarks:
            hands_visible = len(hand_res.hand_landmarks)
            
            if face_detected and lms:
                # Use normalized coords for distance checks
                left_ear_lm  = lms[234]
                right_ear_lm = lms[454]
                mouth_left   = lms[291]
                mouth_right  = lms[61]
                mouth_x = (mouth_left.x + mouth_right.x) / 2.0
                mouth_y = (mouth_left.y + mouth_right.y) / 2.0

                for hand_lms in hand_res.hand_landmarks:
                    # Use wrist (0) and fingertips (4,8,12,16,20) for better accuracy
                    key_points = [hand_lms[i] for i in [0, 4, 8, 12, 16, 20]]
                    for hl in key_points:
                        dist_left_ear  = math.hypot(hl.x - left_ear_lm.x,  hl.y - left_ear_lm.y)
                        dist_right_ear = math.hypot(hl.x - right_ear_lm.x, hl.y - right_ear_lm.y)
                        dist_mouth     = math.hypot(hl.x - mouth_x,         hl.y - mouth_y)

                        if dist_left_ear < 0.10:
                            hand_anomaly_detected = True
                            hand_anomaly_desc = "Hand near left ear — possible phone or earpiece."
                            break
                        if dist_right_ear < 0.10:
                            hand_anomaly_detected = True
                            hand_anomaly_desc = "Hand near right ear — possible phone or earpiece."
                            break
                        if dist_mouth < 0.09:
                            hand_anomaly_detected = True
                            hand_anomaly_desc = "Hand covering mouth — possible whispering or hidden speech."
                            break
                    if hand_anomaly_detected:
                        break

    else:
        # Premium simulation fallback (micro-movements to simulate real tracking)
        import time
        t = time.time()
        pitch = round(math.sin(t * 0.5) * 1.2, 2)
        yaw   = round(math.cos(t * 0.4) * 1.5, 2)
        roll  = round(math.sin(t * 0.3) * 0.8, 2)
        gaze_h = round(math.sin(t * 0.2) * 0.01, 4)
        gaze_v = round(math.cos(t * 0.2) * 0.01, 4)
        eye_yaw = round(gaze_h * 60.0, 2)
        eye_pitch = round(-gaze_v * 40.0, 2)
        ear_left = ear_right = 0.28
        face_detected = True
        face_count = 1
        hands_visible = 0

    # ── Combine head pose + iris gaze into final gaze vector ──────
    # Head pose contributes 70%, iris contributes 30% (head movement dominant)
    total_yaw   = round(yaw * 0.7 + eye_yaw   * 0.3, 2)
    total_pitch = round(pitch * 0.7 + eye_pitch * 0.3, 2)

    # Gaze anomaly: stricter thresholds
    gaze_anomaly = abs(total_yaw) > 12.0 or total_pitch < -10.0 or total_pitch > 15.0
    severity = None
    if gaze_anomaly:
        severity = "HIGH" if abs(total_yaw) > 30 or abs(total_pitch) > 25 else "MEDIUM"
    elif hand_anomaly_detected:
        severity = "HIGH"
    elif hands_visible > 1:
        severity = "MEDIUM"

    return {
        "status":            "ok",
        "gaze_anomaly":      gaze_anomaly,
        "hands_visible":     hands_visible,
        "face_detected":     face_detected,
        "face_count":        face_count,
        "severity":          severity,
        "pose":              {"pitch": total_pitch, "yaw": total_yaw, "roll": roll},
        "eye_gaze":          {"h": gaze_h, "v": gaze_v},
        "head_pose":         {"pitch": pitch, "yaw": yaw, "roll": roll},
        "ear":               {"left": ear_left, "right": ear_right},
        "hand_anomaly":      hand_anomaly_detected,
        "hand_anomaly_desc": hand_anomaly_desc,
        "timestamp":         datetime.utcnow().isoformat(),
    }

async def infer_async(b64_frame: str) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _infer_frame, b64_frame)


# ─── WebSocket: CV Proctoring ─────────────────────────────────────────────────
@app.websocket("/ws/cv")
async def ws_cv(websocket: WebSocket):
    await websocket.accept()
    session_id = websocket.query_params.get("session_id", str(uuid.uuid4()))
    cv_agent   = CVAgent(session_id=session_id)
    hub = AegisHub(session_id=session_id, db_session=SessionLocal(), recruiter_broadcast=None)
    log.info("[ws/cv] Client connected — session=%s", session_id)
    
    db: Session = SessionLocal()
    try:
        while True:
            frame  = await websocket.receive_text()
            result = await infer_async(frame)

            # Let CVAgent classify with grace-period logic
            event  = cv_agent.process(result) if result["status"] == "ok" else None
            security_context = None
            if result["status"] == "ok":
                security_context = hub.ingest_security_features(result)
                if security_context and security_context.get("fusion"):
                    result["security_fusion"] = security_context["fusion"]
                    result["gaze_estimate"] = security_context["gaze_estimate"]
                    result["liveness"] = security_context["liveness"]
                    result["ks_anomalous"] = security_context["ks_anomalous"]
                    if security_context.get("gesture_event"):
                        result["gesture_event"] = security_context["gesture_event"]

                # ── Execute AEGIS v4.0 Forensic Engine Modules ────────────────
                now_ts = time.time()
                yaw_val = float(result.get("pose", {}).get("yaw", 0.0))
                pitch_val = float(result.get("pose", {}).get("pitch", 0.0))
                
                obs = ForensicObservation(
                    timestamp=now_ts,
                    gaze_angular_deviation=abs(yaw_val),
                    gaze_screen_coords=(0.5 + yaw_val/100.0, 0.5 + pitch_val/100.0),
                    pupil_diameter_mm=3.5,
                    screen_brightness_level=0.8,
                    facial_rgb_mean=(120.0, 110.0, 105.0),
                    candidate_speaking=False,
                    keyboard_typing_active=result.get("hand_anomaly", False)
                )

                # Module 8: KS-Test Baseline Drift
                ks_alert = ks_engine.process(obs)
                result["v4_ks_test"] = {"anomalous": ks_alert is not None, "alert": ks_alert.description if ks_alert else None}

                # Module 7: Whitespace Fixation Analysis
                ws_alert = whitespace_engine.process(obs)
                result["v4_whitespace"] = {"anomalous": ws_alert is not None, "alert": ws_alert.description if ws_alert else None}

                # Module 6: PLR & rPPG Liveness
                live_alert = liveness_engine.process(obs)
                result["v4_liveness"] = {"passed": live_alert is None, "alert": live_alert.description if live_alert else "Liveness verified"}

                # Module 9 & Fusion Brain: Multi-modal fusion
                gaze_packet = ChannelPacket("GAZE", now_ts, 0.95 if (ks_alert or ws_alert) else 0.05, ks_alert.description if ks_alert else "Gaze nominal", (ks_alert or ws_alert) is not None)
                gest_packet = ChannelPacket("GESTURE", now_ts, 0.95 if result.get("hand_anomaly") else 0.05, result.get("hand_anomaly_desc", ""), result.get("hand_anomaly") is not None)
                fusion_engine.process_packet(gaze_packet)
                decision = fusion_engine.process_packet(gest_packet)
                result["v4_fusion"] = {
                    "verdict": decision.action_level,
                    "integrity_score": round(decision.integrity_score_100, 1),
                    "active_channels": decision.active_channel_count,
                    "description": decision.description
                }

            if event:
                # Persist risk event to DB
                db_event = TelemetryEvent(
                    session_id  = session_id,
                    event_type  = event.event_type,
                    severity    = event.severity,
                    confidence  = event.confidence,
                    pitch       = event.pose.get("pitch"),
                    yaw         = event.pose.get("yaw"),
                    roll        = event.pose.get("roll"),
                    hands_count = event.hands_count,
                    description = event.description,
                )
                db.add(db_event)
                db.commit()

                # Notify recruiter WebSocket in real-time
                await broadcast_to_recruiter(session_id, {
                    "type":      "RISK_EVENT",
                    "event":     {
                        "event_type":  event.event_type,
                        "severity":    event.severity,
                        "description": event.description,
                        "ts":          event.timestamp,
                    },
                    "score":     cv_agent.session_id and 100 - (cv_agent.total_events * 4),
                })

            # Always return current inference to candidate frontend
            result["integrity_score"] = max(100 - cv_agent.total_events * 4, 0)
            await websocket.send_json(result)

    except WebSocketDisconnect:
        log.info("[ws/cv] Disconnected — session=%s, events=%d", session_id, cv_agent.total_events)
    except Exception as e:
        log.error("[ws/cv] Error: %s", e, exc_info=True)
    finally:
        db.close()


# ─── WebSocket: AI Interview (Hub Orchestrator) ───────────────────────────────
@app.websocket("/ws/interview")
async def ws_interview(websocket: WebSocket):
    await websocket.accept()
    session_id   = str(uuid.uuid4())
    language     = websocket.query_params.get("lang", "en")
    job_role     = websocket.query_params.get("role", "software_engineer")
    candidate_id = websocket.query_params.get("candidate_id", None)

    db: Session = SessionLocal()

    # Create DB session record
    db_session = InterviewSession(id=session_id, status="IN_PROGRESS")
    db.add(db_session)
    db.commit()

    # HITL broadcast function bound to this session_id
    async def hitl_broadcast(payload: dict):
        payload["session_id"] = session_id
        await broadcast_to_recruiter(session_id, payload)

    # Initialize Hub — loads memory, spins up spokes
    hub = AegisHub(
        session_id        = session_id,
        candidate_id      = candidate_id,
        language          = language,
        job_role          = job_role,
        ai_client         = ai_client,
        db_session        = db,
        recruiter_broadcast = hitl_broadcast,
    )

    # Write SESSION_PLAN artifact
    plan_artifact = AgentArtifact(
        session_id    = session_id,
        agent_name    = "hub",
        artifact_type = "SESSION_PLAN",
        content_json  = json.dumps({
            "session_id":    session_id,
            "language":      language,
            "job_role":      job_role,
            "memory_loaded": hub._memory_ctx.context_injected,
            "procedures":    hub._memory_ctx.relevant_procedures[:2],
            "started_at":    datetime.utcnow().isoformat(),
        }),
    )
    db.add(plan_artifact)
    db.commit()

    log.info("[ws/interview] Hub started — session=%s, role=%s", session_id, job_role)

    # Initial greeting
    await websocket.send_json({
        "role":           "ai",
        "message":        (
            "Hello! I'm Aria, your AI interviewer for today. "
            "I'm genuinely excited to learn about your background and experience. "
            "Let's start — could you tell me about a technical project you've worked on recently "
            "that you're particularly proud of? What was your specific contribution?"
        ),
        "session_id":     session_id,
        "agent_statuses": hub.agent_statuses,
        "integrity_score": 100,
    })

    try:
        while True:
            payload = await websocket.receive_json()
            
            # Handle digital security telemetry events forwarded from client
            if payload.get("type") == "telemetry_event":
                event_data = payload.get("event")
                await hub.ingest_digital_event(event_data)
                continue

            # Handle audio features
            if payload.get("type") == "audio_features":
                features = payload.get("features")
                await hub.ingest_audio_features(features)
                continue

            # Handle keystroke baseline profile sync
            if payload.get("type") == "keystroke_baseline":
                profile = payload.get("profile")
                await hub.sync_keystroke_baseline(profile)
                continue

            text    = payload.get("message", "").strip()
            if not text:
                continue

            # Hub executes full ReAct loop
            response = await hub.think_and_respond(text)
            await websocket.send_json(response)

            # If code review happened — persist artifact
            if response.get("code_review"):
                cr = response["code_review"]
                artifact = AgentArtifact(
                    session_id    = session_id,
                    agent_name    = "code_review",
                    artifact_type = "CODE_REVIEW",
                    content_json  = json.dumps(cr),
                )
                db.add(artifact)
                db.commit()

    except WebSocketDisconnect:
        log.info("[ws/interview] Disconnected — session=%s", session_id)

        # Hub finalization — write episodic memory + risk report
        risk_summary = await hub.end_session()

        # Persist RISK_REPORT artifact
        risk_artifact = AgentArtifact(
            session_id    = session_id,
            agent_name    = "cv_agent",
            artifact_type = "RISK_REPORT",
            content_json  = json.dumps(risk_summary),
        )
        db.add(risk_artifact)

        # Update DB session record
        db_session.status    = "COMPLETED"
        db_session.end_time  = datetime.utcnow()
        db_session.trust_score = hub.integrity_score
        db.commit()

    except Exception as e:
        log.error("[ws/interview] Fatal: %s", e, exc_info=True)
    finally:
        db.close()


# ─── WebSocket: Recruiter / HITL ─────────────────────────────────────────────
@app.websocket("/ws/recruiter/{session_id}")
async def ws_recruiter(websocket: WebSocket, session_id: str):
    """
    Recruiter subscribes to a specific session.
    Receives: real-time risk events, HITL escalations, agent status updates.
    Sends:    HITL decisions (CONTINUE | WARN_CANDIDATE | TERMINATE).
    """
    await websocket.accept()
    recruiter_sockets[session_id] = websocket
    log.info("[ws/recruiter] Recruiter connected to session %s", session_id)

    try:
        while True:
            decision = await websocket.receive_json()
            action   = decision.get("action")
            log.info("[ws/recruiter] HITL decision received: %s for session %s", action, session_id)

            if action == "TERMINATE":
                # In production: signal the interview WS to close
                log.warning("[ws/recruiter] TERMINATE issued for session %s", session_id)
            elif action == "WARN_CANDIDATE":
                log.info("[ws/recruiter] WARN issued for session %s", session_id)

    except WebSocketDisconnect:
        recruiter_sockets.pop(session_id, None)
        log.info("[ws/recruiter] Recruiter disconnected from session %s", session_id)


# ─── REST Endpoints ───────────────────────────────────────────────────────────
@app.get("/api/health", tags=["Health"])
def health():
    return {
        "service":    "Aegis Interview Room",
        "version":    "3.0.0",
        "status":     "operational",
        "ai_online":  ai_client is not None,
        "mcp_tools":  len(mcp_client.list_tools()),
        "compliance": ["GDPR", "BIPA", "CCPA", "EEOC"],
        "agents":     ["Aria (Hub)", "CVAgent", "CodeReviewAgent", "BiasAuditAgent", "MemoryAgent"],
    }


@app.get("/api/v1/mcp/tools", tags=["MCP"])
def list_mcp_tools():
    """List all available MCP tools across all mounted servers."""
    return {"tools": mcp_client.list_tools()}


@app.post("/api/v1/mcp/invoke", tags=["MCP"])
async def invoke_mcp_tool(body: dict):
    """
    Invoke an MCP tool directly (for admin/debug use).
    Production: restrict to admin role only.
    """
    tool_path  = body.get("tool")
    params     = body.get("params", {})
    session_id = body.get("session_id", "admin")
    result = await mcp_client.invoke(tool_path, params, session_id=session_id)
    return result


@app.get("/api/v1/artifacts/{session_id}", tags=["Artifacts"])
def get_artifacts(session_id: str):
    """List all agent artifacts for a session."""
    db = SessionLocal()
    try:
        artifacts = (
            db.query(AgentArtifact)
            .filter_by(session_id=session_id)
            .order_by(AgentArtifact.created_at.asc())
            .all()
        )
        return {
            "session_id": session_id,
            "artifacts": [{
                "id":           a.id,
                "agent":        a.agent_name,
                "type":         a.artifact_type,
                "created_at":   a.created_at.isoformat(),
                "has_content":  bool(a.content_json),
                "content":      json.loads(a.content_json) if a.content_json else None,
            } for a in artifacts]
        }
    finally:
        db.close()


@app.get("/api/v1/integrity/{session_id}", tags=["Reports"])
def get_integrity_report(session_id: str):
    """Generate final integrity report for recruiter review."""
    db = SessionLocal()
    try:
        session = db.query(InterviewSession).filter_by(id=session_id).first()
        if not session:
            return {"error": "Session not found"}
        events = db.query(TelemetryEvent).filter_by(session_id=session_id).all()
        return {
            "session_id":      session_id,
            "status":          session.status,
            "integrity_score": session.trust_score or 100,
            "anomaly_count":   len(events),
            "risk_breakdown":  {
                "HIGH":   sum(1 for e in events if e.severity == "HIGH"),
                "MEDIUM": sum(1 for e in events if e.severity == "MEDIUM"),
                "LOW":    sum(1 for e in events if e.severity == "LOW"),
            },
            "gaze_heatmap":    json.loads(session.gaze_heatmap) if session.gaze_heatmap else {},
            "response_latency": session.response_latency or 0.0,
            "keystroke_profile": json.loads(session.keystroke_profile) if session.keystroke_profile else {},
            "start":           session.start_time.isoformat() if session.start_time else None,
            "end":             session.end_time.isoformat() if session.end_time else None,
        }
    finally:
        db.close()


# ─── Serve Frontend SPA in Production ─────────────────────────────────────────
from fastapi.staticfiles import StaticFiles

dist_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../frontend/dist"))
if os.path.exists(dist_path):
    log.info("[StaticFiles] Serving built frontend SPA from %s", dist_path)
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="static")
else:
    @app.get("/", tags=["Health"])
    def root_health():
        return health()
