"""
mcp/sqlite_server.py — SQLite MCP Server
Wraps the Aegis database and exposes structured query tools.

Provides:
  - query_candidate_sessions: retrieve a candidate's past interview history
  - get_session_risk_events:  fetch risk events for a session
  - get_integrity_score:      fetch the final score for a session
  - search_similar_sessions:  find sessions with similar patterns

Security: All queries are parameterized — NO raw string interpolation.
Uses locked SQL queries (hard edges) for compliance-sensitive data.
"""
import logging
import re
from .client import MCPServer, MCPTool

log = logging.getLogger("aegis.mcp.sqlite")


def _build_sqlite_server(db_session_factory) -> MCPServer:
    """
    Factory function — builds and registers the SQLite MCP server.
    db_session_factory: callable that returns a new DB session.
    """
    server = MCPServer(name="sqlite")

    # ── Tool: query_candidate_sessions ───────────────────────────────────────
    async def query_candidate_sessions(candidate_email: str, limit: int = 5) -> list[dict]:
        """Retrieve past interview sessions for a candidate by email."""
        db = db_session_factory()
        try:
            from database import InterviewSession, Candidate
            candidate = db.query(Candidate).filter_by(email=candidate_email).first()
            if not candidate:
                return []
            sessions = (
                db.query(InterviewSession)
                .filter_by(candidate_id=candidate.id)
                .order_by(InterviewSession.start_time.desc())
                .limit(max(1, min(limit, 20)))   # clamp: 1-20
                .all()
            )
            return [{
                "session_id":      s.id,
                "status":          s.status,
                "trust_score":     s.trust_score,
                "anomaly_count":   s.anomaly_count,
                "start_time":      s.start_time.isoformat() if s.start_time else None,
            } for s in sessions]
        except Exception as e:
            log.error("[sqlite/query_candidate_sessions] %s", e)
            return []
        finally:
            db.close()

    server.register(MCPTool(
        name        = "query_candidate_sessions",
        description = "Retrieve past interview sessions for a candidate by their email address.",
        parameters  = {
            "candidate_email": {"type": "string", "description": "Candidate email address"},
            "limit":           {"type": "integer", "description": "Max sessions to return (1-20)"},
        },
        handler = query_candidate_sessions,
    ))

    # ── Tool: get_session_risk_events ────────────────────────────────────────
    async def get_session_risk_events(session_id: str) -> list[dict]:
        """Fetch all risk events for a specific session."""
        db = db_session_factory()
        try:
            from database import TelemetryEvent
            events = (
                db.query(TelemetryEvent)
                .filter_by(session_id=session_id)
                .order_by(TelemetryEvent.timestamp.asc())
                .all()
            )
            return [{
                "event_type": e.event_type,
                "severity":   e.severity,
                "description": e.description,
                "timestamp":  e.timestamp.isoformat() if e.timestamp else None,
            } for e in events]
        except Exception as e:
            log.error("[sqlite/get_session_risk_events] %s", e)
            return []
        finally:
            db.close()

    server.register(MCPTool(
        name        = "get_session_risk_events",
        description = "Retrieve all proctoring risk events for a given session ID.",
        parameters  = {"session_id": {"type": "string", "description": "The session UUID"}},
        handler     = get_session_risk_events,
    ))

    # ── Tool: get_integrity_score ────────────────────────────────────────────
    async def get_integrity_score(session_id: str, caller_role: str = "CANDIDATE") -> dict:
        """Get the aggregated integrity score for a session. Requires authorization."""
        # H-7: Validate session_id format
        if not re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', session_id, re.I):
            return {"error": "Invalid session_id format"}
        # H-7: Only RECRUITER and ADMIN can access integrity scores
        if caller_role not in ("RECRUITER", "ADMIN"):
            return {"error": "Insufficient permissions to access integrity score"}
        db = db_session_factory()
        try:
            from database import InterviewSession
            s = db.query(InterviewSession).filter_by(id=session_id).first()
            if not s:
                return {"error": "Session not found"}
            return {
                "session_id":    session_id,
                "trust_score":   s.trust_score,
                "anomaly_count": s.anomaly_count,
                "status":        s.status,
            }
        except Exception as e:
            log.error("[sqlite/get_integrity_score] %s", e)
            return {"error": str(e)}
        finally:
            db.close()

    server.register(MCPTool(
        name        = "get_integrity_score",
        description = "Fetch the final integrity score and anomaly count for a completed session.",
        parameters  = {"session_id": {"type": "string", "description": "The session UUID"}},
        handler     = get_integrity_score,
    ))

    log.info("[MCPServer/sqlite] Registered %d tools", len(server.tools))
    return server
