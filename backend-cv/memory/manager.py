"""
memory/manager.py — MemoryManager
High-level facade over all 4 memory tiers.
Used directly in main.py to initialize the memory subsystem.
"""
import logging
from .vector_store import VectorStore

log = logging.getLogger("aegis.memory.manager")


class MemoryManager:
    """
    Coordinates the 4-tier memory system:
      Tier 1 (In-context):  managed externally by the Hub's deque
      Tier 2 (Episodic):    SQLite EpisodicMemory table
      Tier 3 (External):    FAISS VectorStore
      Tier 4 (Procedural):  procedures.json
    """

    def __init__(self, db_session_factory=None):
        self.db_factory   = db_session_factory
        self.vector_store = VectorStore()
        log.info("[MemoryManager] Initialized (vector_store size=%d)", self.vector_store.size)

    def get_vector_store(self) -> VectorStore:
        return self.vector_store

    def get_episodic_summaries(self, candidate_id: str, limit: int = 3) -> list[str]:
        """Tier 2: Load past session summaries from DB."""
        if not self.db_factory or not candidate_id:
            return []
        db = self.db_factory()
        try:
            from database import EpisodicMemory
            rows = (
                db.query(EpisodicMemory)
                .filter_by(candidate_id=candidate_id)
                .order_by(EpisodicMemory.created_at.desc())
                .limit(limit)
                .all()
            )
            return [r.summary_text for r in rows]
        except Exception as e:
            log.warning("[MemoryManager] Episodic load error: %s", e)
            return []
        finally:
            db.close()
