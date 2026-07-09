-- init-db.sql — Aegis Platform PostgreSQL initialization
-- Run automatically by docker-compose on first container start

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR PRIMARY KEY,
    email VARCHAR UNIQUE NOT NULL,
    hashed_password VARCHAR NOT NULL,
    role VARCHAR NOT NULL DEFAULT 'CANDIDATE',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidates (
    id VARCHAR PRIMARY KEY,
    email VARCHAR UNIQUE NOT NULL,
    name VARCHAR,
    face_embedding_hash VARCHAR,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR PRIMARY KEY,
    candidate_id VARCHAR REFERENCES candidates(id),
    recruiter_id VARCHAR REFERENCES users(id),
    trust_score INTEGER DEFAULT 100,
    status VARCHAR DEFAULT 'pending',
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telemetry_events (
    id VARCHAR PRIMARY KEY,
    session_id VARCHAR REFERENCES sessions(id),
    event_type VARCHAR NOT NULL,
    severity VARCHAR NOT NULL,
    confidence REAL,
    pitch REAL,
    yaw REAL,
    roll REAL,
    hands_count INTEGER,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_artifacts (
    id VARCHAR PRIMARY KEY,
    session_id VARCHAR REFERENCES sessions(id),
    agent_name VARCHAR NOT NULL,
    artifact_type VARCHAR NOT NULL,
    content_json TEXT,
    s3_key VARCHAR,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mcp_invocations (
    id VARCHAR PRIMARY KEY,
    session_id VARCHAR NOT NULL,
    tool_path VARCHAR NOT NULL,
    params_keys VARCHAR,
    result_ok BOOLEAN,
    invoked_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hitl_decisions (
    id VARCHAR PRIMARY KEY,
    session_id VARCHAR REFERENCES sessions(id),
    audit_id VARCHAR UNIQUE NOT NULL,
    recruiter_id VARCHAR REFERENCES users(id),
    decision VARCHAR NOT NULL,
    score_at_time INTEGER,
    reason VARCHAR,
    escalation_type VARCHAR DEFAULT 'SECURITY',
    decided_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_telemetry_session ON telemetry_events(session_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_severity ON telemetry_events(severity);
CREATE INDEX IF NOT EXISTS idx_artifacts_session ON agent_artifacts(session_id);
CREATE INDEX IF NOT EXISTS idx_hitl_session ON hitl_decisions(session_id);