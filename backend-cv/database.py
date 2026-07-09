"""
database.py — Aegis Interview Room
Full polyglot-persistence-inspired schema using SQLite/SQLAlchemy.
Mirrors the PostgreSQL + TimescaleDB schema from the PRD §5.

In production:
  - PostgreSQL for relational tables
  - TimescaleDB for biometric_telemetry (hypertable on timestamp)
  - Pinecone/Milvus for facial embedding vectors
  - AWS S3 for video/audio artifacts
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey,
    Integer, String, Text, create_engine, Index,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./aegis.db")
os.environ["DATABASE_URL"] = DATABASE_URL

# P-1: PostgreSQL connection pooling for production (SQLite fallback for dev)
_connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    _connect_args["check_same_thread"] = False
    _pool_size = 1
else:
    _pool_size = int(os.getenv("DB_POOL_SIZE", "10"))
    _connect_args["pool_size"] = _pool_size
    _connect_args["max_overflow"] = int(os.getenv("DB_POOL_OVERFLOW", "20"))
    _connect_args["pool_pre_ping"] = True
    _connect_args["pool_recycle"] = 3600

engine       = create_engine(DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base         = declarative_base()

def _uuid(): return str(uuid.uuid4())


# ─── RELATIONAL SCHEMA (maps to PostgreSQL in production) ─────────────────────

class Organization(Base):
    """Multi-tenant organizations (enterprise clients)."""
    __tablename__ = "organizations"
    id         = Column(String, primary_key=True, default=_uuid)
    name       = Column(String, nullable=False)
    plan_tier  = Column(String, nullable=False, default="STARTER")   # STARTER | PRO | ENTERPRISE
    bipa_region = Column(String, nullable=False, default="US")        # GDPR region awareness
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    users      = relationship("User", back_populates="org")


class User(Base):
    """Platform users: recruiters, admins, candidates."""
    __tablename__ = "users"
    id                 = Column(String, primary_key=True, default=_uuid)
    org_id             = Column(String, ForeignKey("organizations.id"), nullable=True)
    email              = Column(String, unique=True, nullable=False, index=True)
    password_hash      = Column(String, nullable=False)
    role               = Column(String, nullable=False, default="CANDIDATE")
    preferred_language = Column(String, nullable=False, default="en")
    timezone           = Column(String, nullable=False, default="UTC")
    created_at         = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_login         = Column(DateTime, nullable=True)
    accommodation_mode = Column(Boolean, nullable=False, default=False)   # PRD §4.4 — relaxed proctoring

    org      = relationship("Organization", back_populates="users")
    sessions = relationship("InterviewSession", back_populates="recruiter", foreign_keys="InterviewSession.recruiter_id")


class Candidate(Base):
    """Candidate profiles — PII encrypted at rest in production."""
    __tablename__ = "candidates"
    id               = Column(String, primary_key=True, default=_uuid)
    # PII fields — in production these would be AES-256 encrypted at application layer
    first_name       = Column(String, nullable=False)
    last_name        = Column(String, nullable=False)
    email            = Column(String, unique=True, nullable=False, index=True)
    github_url       = Column(String, nullable=True)
    linkedin_url     = Column(String, nullable=True)
    native_language  = Column(String, nullable=False, default="en")
    region_code      = Column(String, nullable=False, default="US")
    # Biometric anchor — NOT the raw embedding, just the hash
    face_embedding_hash = Column(String, nullable=True)   # SHA-256 of face geometry
    created_at       = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    sessions = relationship("InterviewSession", back_populates="candidate")


class Assessment(Base):
    """Interview templates with questions and proctoring strictness."""
    __tablename__ = "assessments"
    id              = Column(String, primary_key=True, default=_uuid)
    title           = Column(String, nullable=False)
    description     = Column(Text, nullable=True)
    job_description = Column(Text, nullable=True)
    strictness_level = Column(String, nullable=False, default="STANDARD")  # STANDARD | STRICT | MAXIMUM
    gaze_threshold   = Column(Float,  nullable=False, default=18.0)         # Yaw degrees before flag
    max_gaze_duration = Column(Float, nullable=False, default=3.0)          # Seconds before log
    created_by       = Column(String, ForeignKey("users.id"))
    created_at       = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    sessions = relationship("InterviewSession", back_populates="assessment")


class InterviewSession(Base):
    """
    Core session record — one per candidate interview.
    Links to time-series telemetry, risk events, and video artifacts.
    """
    __tablename__ = "sessions"
    id                  = Column(String,  primary_key=True, default=_uuid)
    candidate_id        = Column(String,  ForeignKey("candidates.id"), nullable=True)
    assessment_id       = Column(String,  ForeignKey("assessments.id"), nullable=True)
    recruiter_id        = Column(String,  ForeignKey("users.id"), nullable=True)
    data_residency_zone = Column(String,  nullable=False, default="us-east-1")   # GDPR data locality
    start_time          = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    end_time            = Column(DateTime, nullable=True)
    status              = Column(String,  nullable=False, default="PENDING")     # PENDING | IN_PROGRESS | COMPLETED | ABORTED
    # Aggregate outputs
    trust_score         = Column(Float,   nullable=True)   # 0-100 Integrity Score
    anomaly_count       = Column(Integer, default=0)
    liveness_passed     = Column(Boolean, nullable=True)
    gaze_heatmap        = Column(Text,    nullable=True)   # JSON string of quadrant counts
    response_latency    = Column(Float,   nullable=True)   # Average latency in ms
    keystroke_profile   = Column(Text,    nullable=True)   # JSON string of typing dynamics stats
    # Storage references (S3 pre-signed URL placeholders)
    video_s3_key        = Column(String,  nullable=True)
    audio_s3_key        = Column(String,  nullable=True)
    report_s3_key       = Column(String,  nullable=True)

    candidate  = relationship("Candidate", back_populates="sessions")
    assessment = relationship("Assessment", back_populates="sessions")
    recruiter  = relationship("User", back_populates="sessions", foreign_keys=[recruiter_id])
    events     = relationship("TelemetryEvent", back_populates="session", cascade="all, delete-orphan")


class TelemetryEvent(Base):
    """
    High-severity telemetry events (risk flags).
    Permanent forensic log visible to recruiters — NOT ephemeral.
    Candidate only sees ephemeral toast alerts (handled client-side).

    In production this table maps to TimescaleDB hypertable
    partitioned by timestamp for efficient time-range queries.
    """
    __tablename__ = "telemetry_events"
    id           = Column(String,  primary_key=True, default=_uuid)
    session_id   = Column(String,  ForeignKey("sessions.id"), nullable=False)
    event_type   = Column(String,  nullable=False)     # GAZE_ANOMALY | HAND_ANOMALY | HEAD_TURN | AUDIO_ANOMALY | SECONDARY_PERSON
    severity     = Column(String,  nullable=False, default="MEDIUM")  # LOW | MEDIUM | HIGH | CRITICAL
    confidence   = Column(Float,   nullable=True)
    pitch        = Column(Float,   nullable=True)
    yaw          = Column(Float,   nullable=True)
    roll         = Column(Float,   nullable=True)
    hands_count  = Column(Integer, nullable=True)
    description  = Column(Text,    nullable=True)
    timestamp    = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    session = relationship("InterviewSession", back_populates="events")

# Index for time-series queries (TimescaleDB equivalent)
Index("idx_telemetry_session_time", TelemetryEvent.session_id, TelemetryEvent.timestamp)


class BiometricBaseline(Base):
    """
    Calibration baseline per session.
    Stores normalized gaze center, skin tone LUT, and lighting conditions
    for adaptive false-positive reduction.
    """
    __tablename__ = "biometric_baselines"
    id              = Column(String,  primary_key=True, default=_uuid)
    session_id      = Column(String,  ForeignKey("sessions.id"), nullable=False, unique=True)
    baseline_pitch  = Column(Float,   nullable=True)
    baseline_yaw    = Column(Float,   nullable=True)
    lighting_lux    = Column(Float,   nullable=True)
    face_lm_quality = Column(Float,   nullable=True)    # 0-1 landmark confidence
    calibrated_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    session = relationship("InterviewSession")


class EpisodicMemory(Base):
    """
    Tier 2 Memory: Session summaries per candidate.
    Written by MemoryAgent at session end.
    Retrieved by MemoryAgent at next session start.
    Auto-purged after 90 days (GDPR compliance — cron job in production).
    """
    __tablename__ = "episodic_memory"
    id             = Column(String,  primary_key=True, default=_uuid)
    candidate_id   = Column(String,  ForeignKey("candidates.id"), nullable=False, index=True)
    session_id     = Column(String,  ForeignKey("sessions.id"), nullable=False)
    summary_text   = Column(Text,    nullable=False)   # AI-generated session summary
    risk_snapshot  = Column(Text,    nullable=True)    # JSON: integrity score, event counts
    embedding_ref  = Column(String,  nullable=True)    # FAISS index entry ID (Tier 3 cross-ref)
    created_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at     = Column(DateTime, nullable=True)   # 90-day auto-purge timestamp

    candidate = relationship("Candidate")


class AgentArtifact(Base):
    """
    Artifact system: every significant agent action creates a timestamped artifact.
    Maps to the "Artifact Generation" security/transparency principle.
    
    Types:
      SESSION_PLAN     — Aria's initial interview plan (generated at start)
      RISK_REPORT      — Aggregated CV anomalies (generated at end)
      CODE_REVIEW      — CodeReviewAgent output for IDE submissions
      BIAS_AUDIT_LOG   — BiasAuditAgent decisions for all questions
      INTEGRITY_REPORT — Final recruiter report (PDF S3 key)
      MEMORY_SUMMARY   — Episodic summary written to Tier 2 memory
    """
    __tablename__ = "agent_artifacts"
    id           = Column(String,  primary_key=True, default=_uuid)
    session_id   = Column(String,  ForeignKey("sessions.id"), nullable=False, index=True)
    agent_name   = Column(String,  nullable=False)          # hub | cv_agent | code_review | bias_agent | memory_agent
    artifact_type = Column(String, nullable=False)          # SESSION_PLAN | RISK_REPORT | CODE_REVIEW | etc.
    content_json  = Column(Text,   nullable=True)           # Inline JSON artifact content
    s3_key        = Column(String, nullable=True)           # For large artifacts (PDF reports, videos)
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    session = relationship("InterviewSession")


class SessionInvitation(Base):
    """
    Invitation-based session start (Phase 6.7).
    Recruiter generates a CSPRNG token, stores SHA-256 hash in DB.
    Candidate enters token to start session — no auth required for entry.
    """
    __tablename__ = "session_invitations"
    id              = Column(String,  primary_key=True, default=_uuid)
    session_id      = Column(String,  ForeignKey("sessions.id"), nullable=False, index=True, unique=True)
    recruiter_id    = Column(String,  ForeignKey("users.id"), nullable=False)
    token_hash      = Column(String,  nullable=False)            # SHA-256 of the plaintext token
    token_prefix    = Column(String,  nullable=False)            # First 8 chars of plaintext (for recruiter reference)
    expires_at      = Column(DateTime, nullable=False)
    used_at         = Column(DateTime, nullable=True)
    status          = Column(String,  nullable=False, default="PENDING")  # PENDING | USED | EXPIRED
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    session   = relationship("InterviewSession")


class MCPInvocationLog(Base):
    """
    Security audit trail: every MCP tool invocation is recorded.
    Implements the Permission Gatekeeper audit requirement.
    """
    __tablename__ = "mcp_invocations"
    id          = Column(String,  primary_key=True, default=_uuid)
    session_id  = Column(String,  nullable=False, index=True)
    tool_path   = Column(String,  nullable=False)    # e.g. "github/get_candidate_repos"
    params_keys = Column(String,  nullable=True)     # JSON array of param names (no values — security)
    result_ok   = Column(Boolean, nullable=True)
    invoked_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class HITLDecision(Base):
    """
    HITL audit trail: every recruiter decision on a HITL escalation.
    Persisted for compliance (EU AI Act Art. 14 — human oversight mandate).
    """
    __tablename__ = "hitl_decisions"
    id           = Column(String,  primary_key=True, default=_uuid)
    session_id   = Column(String,  ForeignKey("sessions.id"), nullable=False, index=True)
    audit_id     = Column(String,  nullable=False, unique=True)   # Correlation ID from escalation
    recruiter_id = Column(String,  ForeignKey("users.id"), nullable=True)
    decision     = Column(String,  nullable=False)               # CONTINUE | WARN_CANDIDATE | TERMINATE
    score_at_time = Column(Integer, nullable=True)                # Integrity score when decision was made
    reason       = Column(String,  nullable=True)                 # Recruiter notes
    escalation_type = Column(String, nullable=False, default="SECURITY")  # SECURITY | BIAS | PLAGIARISM
    decided_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    session = relationship("InterviewSession")


# Create all tables
Base.metadata.create_all(bind=engine)

