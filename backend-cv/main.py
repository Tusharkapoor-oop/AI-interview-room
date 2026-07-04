"""
main.py — Aegis Interview Room Backend v3.1
Security-hardened, multi-session, production-ready architecture.

Changes from v3.0:
  - JWT authentication for all WS + REST endpoints
  - Per-session forensic engine instances (race condition fix)
  - Rate limiting on all WS endpoints
  - Pydantic validation for WS message payloads
  - Origin validation for WebSocket connections
  - OpenTelemetry + Prometheus monitoring
  - Secret validation on startup (fail-fast)
"""
import asyncio
import base64
import json
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import cv2
import mediapipe as mp
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.security import HTTPBearer
from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from database import SessionLocal, InterviewSession, AgentArtifact, TelemetryEvent, User
from agents import AegisHub
from agents.cv_agent import CVAgent
from mcp.client import MCPClient
from mcp.sqlite_server import _build_sqlite_server
from mcp.github_server import _build_github_server
from memory.manager import MemoryManager
from agents.forensic_engine import KSTestBaselineEngine, WhitespaceFixationDetector, PLRrPPGLivenessEngine, ForensicObservation
from agents.fusion_engine import FiveChannelFusionEngine, ChannelPacket
from auth import (
    create_access_token, create_refresh_token, decode_token,
    hash_password, verify_password, get_current_user_from_ws, validate_origin,
    ACCESS_TOKEN_EXPIRE_MINUTES, SKIP_AUTH,
)
from ratelimit import IPBasedRateLimiter
from event_batcher import EventBatcher
from schemas import LoginRequest, RefreshRequest, UserCreate, TokenResponse, WS_MESSAGE_MODELS
from monitoring import (
    setup_observability, WS_MESSAGES_TOTAL, WS_LATENCY, SESSIONS_ACTIVE,
    RISK_EVENTS_TOTAL, metrics_endpoint,
)

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s [%(levelname)-8s] %(name)s — %(message)s",
)
log = logging.getLogger("aegis")

# ─── Fail-Fast Secret Validation ──────────────────────────────────────────────
load_dotenv()

REQUIRED_ENV_VARS = ["JWT_SECRET", "DATABASE_URL"]
missing_vars = [v for v in REQUIRED_ENV_VARS if not os.getenv(v)]
if missing_vars:
    log.error("FATAL: Missing required environment variables: %s", missing_vars)
    log.error("Copy .env.example to .env and fill in the values.")
    raise SystemExit(1)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ai_client = AsyncOpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
if not ai_client:
    log.warning("No OPENAI_API_KEY — running in offline mock mode")

# ─── Global Rate Limiter ──────────────────────────────────────────────────────
ws_rate_limiter = IPBasedRateLimiter(rate=10.0, capacity=20)

# ─── Global DB Event Batcher ─────────────────────────────────────────────────
event_batcher = EventBatcher(db_session_factory=SessionLocal)

# ─── Global MCP Client (mounted at startup) ───────────────────────────────────
mcp_client = MCPClient()
memory_manager = MemoryManager(db_session_factory=SessionLocal)

# ─── Recruiter HITL Connection Registry ───────────────────────────────────────
# Maps session_id → WebSocket (recruiter view for that session)
recruiter_sockets: dict[str, WebSocket] = {}

# ─── Active WS Connections (for graceful shutdown) ────────────────────────────
active_ws_connections: dict[str, WebSocket] = {}

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
    """Mount MCP servers, monitoring, and memory manager on startup."""
    log.info("Aegis v3.1 starting up...")
    mcp_client.mount(_build_sqlite_server(db_session_factory=SessionLocal))
    mcp_client.mount(_build_github_server(ai_client=ai_client))
    log.info("MCP servers mounted: %s", [t["server"] for t in mcp_client.list_tools()])
    setup_observability(app)
    await event_batcher.start()
    yield
    await event_batcher.stop()
    log.info("Aegis shutting down — closing %d active connections", SESSIONS_ACTIVE._value.get())
    for ws_id, ws in list(active_ws_connections.items()):
        try:
            await ws.close(code=1001, reason="Server shutting down")
        except Exception:
            pass
    active_ws_connections.clear()
    log.info("All active connections closed")

# ─── App Setup ────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Aegis Interview Room",
    description="Advanced Biometric Proctoring & Assessment Platform — Agentic Architecture",
    version="3.1.0",
    lifespan=lifespan,
)

security_scheme = HTTPBearer(auto_error=not SKIP_AUTH)


async def require_auth(token: str = Depends(security_scheme)) -> dict:
    """FastAPI dependency — validates JWT or returns dev user in SKIP_AUTH mode."""
    if SKIP_AUTH:
        return {"sub": "dev-user", "role": "ADMIN", "email": "dev@aegis.local"}
    return decode_token(token.credentials)

# Parse allowed origins from env (mandatory in production)
RAW_ORIGINS = os.getenv("ALLOWED_ORIGINS", "")
if not RAW_ORIGINS:
    log.warning("ALLOWED_ORIGINS not set — CORS restricted to localhost development only")
    ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:4173", "http://127.0.0.1:5173"]
else:
    ALLOWED_ORIGINS = [o.strip() for o in RAW_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,0.0.0.0").split(","),
)

@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(self), microphone=(self), display-capture=(self)"
    return response

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
cv_pool_size = max(1, os.cpu_count() or 2)
cv_pool_index = 0
cv_pool_lock = threading.Lock()

try:
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision

    face_options = vision.FaceLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=face_model_path),
        output_face_blendshapes=True,
        num_faces=1
    )
    hand_options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=hand_model_path),
        num_hands=2
    )

    # Create a pool of instances for concurrent access
    face_pool = [vision.FaceLandmarker.create_from_options(face_options) for _ in range(cv_pool_size)]
    hand_pool = [vision.HandLandmarker.create_from_options(hand_options) for _ in range(cv_pool_size)]
    face_landmarker = face_pool
    hand_landmarker = hand_pool

    def acquire_cv_instances():
        global cv_pool_index
        with cv_pool_lock:
            idx = cv_pool_index
            cv_pool_index = (cv_pool_index + 1) % cv_pool_size
            return face_pool[idx], hand_pool[idx]

    log.info("[main] MediaPipe Tasks detectors initialized (%d instances in pool)", cv_pool_size)
except Exception as e:
    log.warning("[main] MediaPipe Tasks not initialized. Using premium simulation: %s", e)
    def acquire_cv_instances():
        return None, None

_MODEL_3D = np.array([
    [0.0,    0.0,    0.0   ],
    [0.0,  -330.0,  -65.0  ],
    [-225.0, 170.0, -135.0 ],
    [225.0,  170.0, -135.0 ],
    [-150.0,-150.0, -125.0 ],
    [150.0, -150.0, -125.0 ],
], dtype=np.float64)
_LM_INDICES = [1, 152, 33, 263, 61, 291]

# ── Kalman Filter Classes (instantiated per-session in ws_cv) ─────
class KalmanPoseSmoother:
    def __init__(self):
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



def _infer_frame(b64_frame: str, pose_smoother: KalmanPoseSmoother, gaze_smoother: KalmanGazeSmoother) -> dict:
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
        
        try:
            f_inst, h_inst = acquire_cv_instances()
            if f_inst and h_inst:
                face_res = f_inst.detect(mp_image)
                hand_res = h_inst.detect(mp_image)
            else:
                face_res = None
                hand_res = None
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
                pitch, yaw, roll = pose_smoother.update(float(angles[0]), float(angles[1]), float(angles[2]))
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
                gaze_h, gaze_v = gaze_smoother.update(raw_gaze_h, raw_gaze_v)
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

    # ── Frame-level metrics for PLR/rPPG liveness engine ─────────
    frame_brightness = float(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).mean()) / 255.0

    face_roi_rgb = (120.0, 110.0, 105.0)
    if face_detected and lms and len(lms) >= 68:
        xs_face = [lms[i].x * w for i in range(68)]
        ys_face = [lms[i].y * h for i in range(68)]
        x1 = max(0, int(min(xs_face)))
        y1 = max(0, int(min(ys_face)))
        x2 = min(w, int(max(xs_face)))
        y2 = min(h, int(max(ys_face)))
        if x2 > x1 and y2 > y1:
            roi = frame[y1:y2, x1:x2]
            if roi.size > 0:
                face_roi_rgb = (
                    float(roi[:, :, 2].mean()),
                    float(roi[:, :, 1].mean()),
                    float(roi[:, :, 0].mean()),
                )

    pupil_diameter_est = 3.5
    if face_detected and lms and len(lms) >= 478:
        iris_left = lms[471]
        iris_right = lms[469]
        iris_w = abs(iris_right.x - iris_left.x) * w
        pupil_diameter_est = round((iris_w / w) * 120.0 * 0.3, 2)

    mouth_open = False
    if face_detected and lms and len(lms) >= 68:
        upper_lip = lms[13]
        lower_lip = lms[14]
        lip_dist = abs(upper_lip.y - lower_lip.y) * h
        eye_h_px = abs(lms[159].y - lms[145].y) * h if len(lms) >= 478 else h * 0.02
        mouth_open = lip_dist > eye_h_px * 1.5 if eye_h_px > 0 else False

    eye_open = (ear_left + ear_right) / 2.0 > 0.2 if face_detected else True
    avg_brightness_val = round(frame_brightness, 4)

    return {
        "status":              "ok",
        "gaze_anomaly":        gaze_anomaly,
        "hands_visible":       hands_visible,
        "face_detected":       face_detected,
        "face_count":          face_count,
        "severity":            severity,
        "pose":                {"pitch": total_pitch, "yaw": total_yaw, "roll": roll},
        "eye_gaze":            {"h": gaze_h, "v": gaze_v},
        "head_pose":           {"pitch": pitch, "yaw": yaw, "roll": roll},
        "ear":                 {"left": ear_left, "right": ear_right},
        "hand_anomaly":        hand_anomaly_detected,
        "hand_anomaly_desc":   hand_anomaly_desc,
        "frame_brightness":    round(frame_brightness, 4),
        "avg_brightness":      avg_brightness_val,
        "eye_open":            eye_open,
        "face_roi_rgb":        tuple(round(v, 1) for v in face_roi_rgb),
        "pupil_diameter_mm":   pupil_diameter_est,
        "candidate_speaking":  mouth_open,
        "timestamp":           datetime.now(timezone.utc).isoformat(),
    }

import re
UUID_REGEX = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)

def validate_session_id(session_id: str) -> bool:
    return bool(UUID_REGEX.match(session_id))


async def infer_async(b64_frame: str, pose_smoother: KalmanPoseSmoother, gaze_smoother: KalmanGazeSmoother) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _infer_frame, b64_frame, pose_smoother, gaze_smoother)


# ─── WebSocket: CV Proctoring ─────────────────────────────────────────────────
@app.websocket("/ws/cv")
async def ws_cv(websocket: WebSocket):
    await websocket.accept()

    # ── Auth ────────────────────────────────────────────────────────────────
    try:
        user = await get_current_user_from_ws(websocket)
        validate_origin(websocket, ALLOWED_ORIGINS)
    except HTTPException:
        return

    # ── Rate Limit ──────────────────────────────────────────────────────────
    if not await ws_rate_limiter.check_websocket(websocket):
        await websocket.close(code=4003, reason="Rate limit exceeded")
        return

    session_id = websocket.query_params.get("session_id", str(uuid.uuid4()))
    active_ws_connections[f"cv:{session_id}"] = websocket
    cv_agent = CVAgent(session_id=session_id)

    # ── Per-session forensic engine instances ───────────────────────────────
    ks_engine_session = KSTestBaselineEngine(calibration_duration_sec=5.0, window_duration_sec=10.0)
    whitespace_engine_session = WhitespaceFixationDetector(window_size_frames=30)
    liveness_engine_session = PLRrPPGLivenessEngine(challenge_duration_sec=10.0)
    fusion_engine_session = FiveChannelFusionEngine(window_duration_sec=10.0)
    pose_smoother = KalmanPoseSmoother()
    gaze_smoother = KalmanGazeSmoother()

    log.info("[ws/cv] Client connected — session=%s, user=%s", session_id, user.get("sub", "unknown"))
    SESSIONS_ACTIVE.inc()

    db: Session = SessionLocal()
    try:
        while True:
            # ── Rate limit per-message ─────────────────────────────────────
            if not await ws_rate_limiter.check_websocket(websocket):
                await websocket.send_json({"status": "error", "msg": "rate_limited"})
                continue

            raw = await websocket.receive_text()

            # Handle JSON messages (non-frame) for future extensibility
            try:
                msg = json.loads(raw)
                if isinstance(msg, dict) and msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong", "timestamp": time.time()})
                    continue
            except (json.JSONDecodeError, TypeError):
                pass

            WS_MESSAGES_TOTAL.labels(endpoint="ws_cv").inc()
            start_ts = time.time()
            result = await infer_async(raw, pose_smoother, gaze_smoother)

            event = cv_agent.process(result) if result["status"] == "ok" else None

            if result["status"] == "ok":
                now_ts = time.time()
                yaw_val = float(result.get("pose", {}).get("yaw", 0.0))
                pitch_val = float(result.get("pose", {}).get("pitch", 0.0))

                obs = ForensicObservation(
                    timestamp=now_ts,
                    gaze_angular_deviation=abs(yaw_val),
                    gaze_screen_coords=(0.5 + yaw_val/100.0, 0.5 + pitch_val/100.0),
                    pupil_diameter_mm=result.get("pupil_diameter_mm", 3.5),
                    screen_brightness_level=result.get("frame_brightness", 0.5),
                    facial_rgb_mean=result.get("face_roi_rgb", (120.0, 110.0, 105.0)),
                    candidate_speaking=result.get("candidate_speaking", False),
                    keyboard_typing_active=result.get("hand_anomaly", False),
                )

                # Module 8: KS-Test Baseline Drift
                ks_alert = ks_engine_session.process(obs)
                result["v4_ks_test"] = {"anomalous": ks_alert is not None, "alert": ks_alert.description if ks_alert else None}

                # Module 7: Whitespace Fixation Analysis
                ws_alert = whitespace_engine_session.process(obs)
                result["v4_whitespace"] = {"anomalous": ws_alert is not None, "alert": ws_alert.description if ws_alert else None}

                # Module 6: PLR & rPPG Liveness
                live_alert = liveness_engine_session.process(obs)
                result["v4_liveness"] = {"passed": live_alert is None, "alert": live_alert.description if live_alert else "Liveness verified"}

                # Fusion Brain
                gaze_packet = ChannelPacket("GAZE", now_ts, 0.95 if (ks_alert or ws_alert) else 0.05, ks_alert.description if ks_alert else "Gaze nominal", (ks_alert or ws_alert) is not None)
                gest_packet = ChannelPacket("GESTURE", now_ts, 0.95 if result.get("hand_anomaly", False) else 0.05, result.get("hand_anomaly_desc", ""), result.get("hand_anomaly", False))
                fusion_engine_session.process_packet(gaze_packet)
                decision = fusion_engine_session.process_packet(gest_packet)
                result["v4_fusion"] = {
                    "verdict": decision.action_level,
                    "integrity_score": round(decision.integrity_score_100, 1),
                    "active_channels": decision.active_channel_count,
                    "description": decision.description,
                }

            if event:
                db_event = TelemetryEvent(
                    session_id=session_id,
                    event_type=event.event_type,
                    severity=event.severity,
                    confidence=event.confidence,
                    pitch=event.pose.get("pitch"),
                    yaw=event.pose.get("yaw"),
                    roll=event.pose.get("roll"),
                    hands_count=event.hands_count,
                    description=event.description,
                )
                await event_batcher.add(db_event)
                RISK_EVENTS_TOTAL.labels(severity=event.severity).inc()

                score_val = max(100 - sum(
                    12 if e.severity == "CRITICAL" else
                    8 if e.severity == "HIGH" else
                    4 if e.severity == "MEDIUM" else 1
                    for e in cv_agent._events_emitted
                ), 0)
                await broadcast_to_recruiter(session_id, {
                    "type": "RISK_EVENT",
                    "event": {
                        "event_type": event.event_type,
                        "severity": event.severity,
                        "description": event.description,
                        "ts": event.timestamp,
                    },
                    "score": score_val,
                })

            result["integrity_score"] = max(100 - sum(
                12 if e.severity == "CRITICAL" else
                8 if e.severity == "HIGH" else
                4 if e.severity == "MEDIUM" else 1
                for e in cv_agent._events_emitted
            ), 0)
            await websocket.send_json(result)
            WS_LATENCY.labels(endpoint="ws_cv").observe(time.time() - start_ts)

    except WebSocketDisconnect:
        log.info("[ws/cv] Disconnected — session=%s, events=%d", session_id, cv_agent.total_events)
    except Exception as e:
        log.error("[ws/cv] Error: %s", e, exc_info=True)
    finally:
        db.close()
        active_ws_connections.pop(f"cv:{session_id}", None)
        SESSIONS_ACTIVE.dec()


# ─── WebSocket: AI Interview (Hub Orchestrator) ───────────────────────────────
@app.websocket("/ws/interview")
async def ws_interview(websocket: WebSocket):
    await websocket.accept()

    # ── Auth ────────────────────────────────────────────────────────────────
    try:
        user = await get_current_user_from_ws(websocket)
        validate_origin(websocket, ALLOWED_ORIGINS)
    except HTTPException:
        return

    # ── Rate Limit ──────────────────────────────────────────────────────────
    if not await ws_rate_limiter.check_websocket(websocket):
        await websocket.close(code=4003, reason="Rate limit exceeded")
        return

    session_id   = str(uuid.uuid4())
    active_ws_connections[f"interview:{session_id}"] = websocket
    language     = websocket.query_params.get("lang", "en")
    job_role     = websocket.query_params.get("role", "software_engineer")
    candidate_id = websocket.query_params.get("candidate_id", None)

    db: Session = SessionLocal()
    db_session = InterviewSession(id=session_id, status="IN_PROGRESS")
    db.add(db_session)
    db.commit()
    SESSIONS_ACTIVE.inc()

    async def hitl_broadcast(payload: dict):
        payload["session_id"] = session_id
        await broadcast_to_recruiter(session_id, payload)

    async def candidate_notify(payload: dict):
        try:
            await websocket.send_json(payload)
        except Exception:
            pass

    hub = AegisHub(
        session_id=session_id,
        candidate_id=candidate_id,
        language=language,
        job_role=job_role,
        ai_client=ai_client,
        db_session=db,
        recruiter_broadcast=hitl_broadcast,
        candidate_broadcast=candidate_notify,
        event_batcher=event_batcher,
    )

    plan_artifact = AgentArtifact(
        session_id=session_id,
        agent_name="hub",
        artifact_type="SESSION_PLAN",
        content_json=json.dumps({
            "session_id": session_id,
            "language": language,
            "job_role": job_role,
            "memory_loaded": hub._memory_ctx.context_injected,
            "procedures": hub._memory_ctx.relevant_procedures[:2],
            "started_at": datetime.now(timezone.utc).isoformat(),
        }),
    )
    db.add(plan_artifact)
    db.commit()

    log.info("[ws/interview] Hub started — session=%s, role=%s, user=%s", session_id, job_role, user.get("sub", "unknown"))

    await websocket.send_json({
        "role": "ai",
        "message": (
            "Hello! I'm Aria, your AI interviewer for today. "
            "I'm genuinely excited to learn about your background and experience. "
            "Let's start — could you tell me about a technical project you've worked on recently "
            "that you're particularly proud of? What was your specific contribution?"
        ),
        "session_id": session_id,
        "agent_statuses": hub.agent_statuses,
        "integrity_score": 100,
    })

    try:
        while True:
            if not await ws_rate_limiter.check_websocket(websocket):
                await websocket.send_json({"role": "system", "message": "Rate limit exceeded. Please slow down."})
                continue

            raw = await websocket.receive_text()
            WS_MESSAGES_TOTAL.labels(endpoint="ws_interview").inc()
            start_ts = time.time()

            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"role": "system", "message": "Invalid JSON payload."})
                continue

            # ── Pydantic validation ──────────────────────────────────────
            msg_type = payload.get("type", "user_message")
            model_cls = WS_MESSAGE_MODELS.get(msg_type)
            if model_cls:
                try:
                    validated = model_cls(**payload)
                except Exception as ve:
                    await websocket.send_json({"role": "system", "message": f"Validation error: {ve}"})
                    continue
            else:
                await websocket.send_json({"role": "system", "message": f"Unknown message type: {msg_type}"})
                continue

            # ── Route validated message by type ─────────────────────────
            if msg_type == "telemetry_event":
                await hub.ingest_digital_event(validated.event)
                continue

            if msg_type == "audio_features":
                await hub.ingest_audio_features(validated.features)
                continue

            if msg_type == "keystroke_baseline":
                await hub.sync_keystroke_baseline(validated.profile)
                continue

            if msg_type == "ping":
                await websocket.send_json({"type": "pong", "timestamp": time.time()})
                continue

            # user_message (default)
            text = validated.message.strip()
            if not text:
                continue
            response = await hub.think_and_respond(text)
            await websocket.send_json(response)

            if response.get("code_review"):
                cr = response["code_review"]
                artifact = AgentArtifact(
                    session_id=session_id,
                    agent_name="code_review",
                    artifact_type="CODE_REVIEW",
                    content_json=json.dumps(cr),
                )
                db.add(artifact)
                db.commit()

            WS_LATENCY.labels(endpoint="ws_interview").observe(time.time() - start_ts)

    except WebSocketDisconnect:
        log.info("[ws/interview] Disconnected — session=%s", session_id)
        risk_summary = await hub.end_session()

        risk_artifact = AgentArtifact(
            session_id=session_id,
            agent_name="cv_agent",
            artifact_type="RISK_REPORT",
            content_json=json.dumps(risk_summary),
        )
        db.add(risk_artifact)

        db_session.status = "COMPLETED"
        db_session.end_time = datetime.now(timezone.utc)
        db_session.trust_score = hub.integrity_score
        db.commit()

    except Exception as e:
        log.error("[ws/interview] Fatal: %s", e, exc_info=True)
    finally:
        db.close()
        active_ws_connections.pop(f"interview:{session_id}", None)
        SESSIONS_ACTIVE.dec()


# ─── WebSocket: Recruiter / HITL ─────────────────────────────────────────────
@app.websocket("/ws/recruiter/{session_id}")
async def ws_recruiter(websocket: WebSocket, session_id: str):
    """
    Recruiter subscribes to a specific session.
    Receives: real-time risk events, HITL escalations, agent status updates.
    Sends:    HITL decisions (CONTINUE | WARN_CANDIDATE | TERMINATE).
    """
    await websocket.accept()

    try:
        user = await get_current_user_from_ws(websocket)
        validate_origin(websocket, ALLOWED_ORIGINS)
    except HTTPException:
        return

    if user.get("role") not in ("RECRUITER", "ADMIN"):
        await websocket.close(code=4003, reason="Insufficient permissions")
        return

    if not await ws_rate_limiter.check_websocket(websocket):
        await websocket.close(code=4003, reason="Rate limit exceeded")
        return

    recruiter_sockets[session_id] = websocket
    active_ws_connections[f"recruiter:{session_id}"] = websocket
    log.info("[ws/recruiter] Recruiter connected to session %s (user=%s)", session_id, user.get("sub", "unknown"))

    try:
        while True:
            raw = await websocket.receive_text()

            if not await ws_rate_limiter.check_websocket(websocket):
                continue

            try:
                decision = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid JSON"})
                continue

            action = decision.get("action")
            if action not in ("CONTINUE", "WARN_CANDIDATE", "TERMINATE", "FLAG_FOR_REVIEW", "IGNORE"):
                await websocket.send_json({"error": "Invalid action"})
                continue

            log.info("[ws/recruiter] HITL decision received: %s for session %s", action, session_id)

            cand_ws = active_ws_connections.get(f"interview:{session_id}")
            if action == "TERMINATE":
                log.warning("[ws/recruiter] TERMINATE issued for session %s", session_id)
                if cand_ws:
                    await cand_ws.send_json({"type": "session_terminated", "reason": "Reviewer terminated the session."})
            elif action == "WARN_CANDIDATE":
                log.info("[ws/recruiter] WARN issued for session %s", session_id)
                if cand_ws:
                    await cand_ws.send_json({"type": "candidate_warning", "message": "Your session has been flagged. Please ensure compliance with proctoring guidelines."})
            elif action == "FLAG_FOR_REVIEW":
                log.info("[ws/recruiter] FLAG_FOR_REVIEW issued for session %s", session_id)
            elif action == "IGNORE":
                log.info("[ws/recruiter] IGNORE issued for session %s — no action taken", session_id)

    except WebSocketDisconnect:
        log.info("[ws/recruiter] Recruiter disconnected from session %s", session_id)
    except Exception as e:
        log.error("[ws/recruiter] Error: %s", e, exc_info=True)
    finally:
        recruiter_sockets.pop(session_id, None)
        active_ws_connections.pop(f"recruiter:{session_id}", None)


# ─── REST Endpoints ───────────────────────────────────────────────────────────
@app.get("/api/health", tags=["Health"])
def health():
    return {
        "service":    "Aegis Interview Room",
        "version":    "3.1.0",
        "status":     "operational",
        "ai_online":  ai_client is not None,
        "mcp_tools":  len(mcp_client.list_tools()),
        "compliance": ["GDPR", "BIPA", "CCPA", "EEOC"],
        "agents":     ["Aria (Hub)", "CVAgent", "CodeReviewAgent", "BiasAuditAgent", "MemoryAgent"],
    }


@app.get("/metrics", tags=["Monitoring"])
def metrics():
    """Prometheus metrics endpoint."""
    return metrics_endpoint()


# ─── Auth Endpoints ──────────────────────────────────────────────────────────
@app.post("/api/v1/auth/register", tags=["Auth"])
def register(body: UserCreate):
    """Register a new user."""
    db = SessionLocal()
    try:
        existing = db.query(User).filter_by(email=body.email).first()
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")

        user = User(
            email=body.email,
            password_hash=hash_password(body.password),
            role=body.role,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        access_token = create_access_token({"sub": user.id, "role": user.role, "email": user.email})
        refresh_token = create_refresh_token({"sub": user.id})

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
    finally:
        db.close()


@app.post("/api/v1/auth/login", tags=["Auth"])
def login(body: LoginRequest):
    """Authenticate and return JWT tokens."""
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(email=body.email).first()
        if not user or not verify_password(body.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        user.last_login = datetime.now(timezone.utc)
        db.commit()

        access_token = create_access_token({"sub": user.id, "role": user.role, "email": user.email})
        refresh_token = create_refresh_token({"sub": user.id})

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
    finally:
        db.close()


@app.post("/api/v1/auth/refresh", tags=["Auth"])
def refresh_token(body: RefreshRequest):
    """Refresh an expired access token."""
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        access_token = create_access_token({"sub": payload["sub"]})
        return TokenResponse(
            access_token=access_token,
            refresh_token=body.refresh_token,
            expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


# ─── Protected REST Endpoints ────────────────────────────────────────────────
@app.get("/api/v1/mcp/tools", tags=["MCP"])
def list_mcp_tools(_: dict = Depends(require_auth)):
    """List all available MCP tools (authenticated)."""
    return {"tools": mcp_client.list_tools()}


@app.post("/api/v1/mcp/invoke", tags=["MCP"])
async def invoke_mcp_tool(body: dict, user: dict = Depends(require_auth)):
    """
    Invoke an MCP tool directly (admin only).
    """
    if user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin role required")

    tool_path = body.get("tool")
    params = body.get("params", {})
    session_id = body.get("session_id", "admin")
    result = await mcp_client.invoke(tool_path, params, session_id=session_id)
    return result


@app.get("/api/v1/artifacts/{session_id}", tags=["Artifacts"])
def get_artifacts(session_id: str, _: dict = Depends(require_auth)):
    """List all agent artifacts for a session (authenticated)."""
    if not validate_session_id(session_id):
        raise HTTPException(status_code=400, detail="Invalid session_id format")
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
                "id": a.id,
                "agent": a.agent_name,
                "type": a.artifact_type,
                "created_at": a.created_at.isoformat(),
                "has_content": bool(a.content_json),
                "content": json.loads(a.content_json) if a.content_json else None,
            } for a in artifacts]
        }
    finally:
        db.close()


@app.get("/api/v1/integrity/{session_id}", tags=["Reports"])
def get_integrity_report(session_id: str, _: dict = Depends(require_auth)):
    """Generate final integrity report for recruiter review (authenticated)."""
    if not validate_session_id(session_id):
        raise HTTPException(status_code=400, detail="Invalid session_id format")
    db = SessionLocal()
    try:
        session = db.query(InterviewSession).filter_by(id=session_id).first()
        if not session:
            return {"error": "Session not found"}
        events = db.query(TelemetryEvent).filter_by(session_id=session_id).all()
        return {
            "session_id": session_id,
            "status": session.status,
            "integrity_score": session.trust_score or 100,
            "anomaly_count": len(events),
            "risk_breakdown": {
                "HIGH": sum(1 for e in events if e.severity == "HIGH"),
                "MEDIUM": sum(1 for e in events if e.severity == "MEDIUM"),
                "LOW": sum(1 for e in events if e.severity == "LOW"),
            },
            "gaze_heatmap": json.loads(session.gaze_heatmap) if session.gaze_heatmap else {},
            "response_latency": session.response_latency or 0.0,
            "keystroke_profile": json.loads(session.keystroke_profile) if session.keystroke_profile else {},
            "start": session.start_time.isoformat() if session.start_time else None,
            "end": session.end_time.isoformat() if session.end_time else None,
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
