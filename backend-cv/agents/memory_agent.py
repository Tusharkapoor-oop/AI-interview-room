"""
agents/memory_agent.py — MemoryAgent Spoke
Specialist agent managing the 4-tier memory system:

  Tier 1 — In-context:   Current conversation deque (managed by Hub)
  Tier 2 — Episodic:     SQLite EpisodicMemory table (session summaries)
  Tier 3 — External:     FAISS vector index (semantic recall)
  Tier 4 — Procedural:   JSON strategy library (role-specific question plans)

Called by the Hub at:
  - Session start: retrieve relevant past episodes + load procedure
  - Mid-interview: semantic search for follow-up question ideas
  - Session end:   write episodic summary + update vector index
"""
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

log = logging.getLogger("aegis.memory_agent")

PROCEDURES_PATH = Path(__file__).parent.parent / "memory" / "procedures.json"


@dataclass
class MemoryContext:
    """What the Hub receives back from the MemoryAgent."""
    candidate_episodes: list[str]   = field(default_factory=list)  # past session summaries
    relevant_procedures: list[str]  = field(default_factory=list)  # strategy hints
    semantic_hits:       list[str]  = field(default_factory=list)  # vector search results
    context_injected:    bool       = False

    def to_prompt_block(self) -> str:
        """Format memory context as a system-prompt injection block."""
        parts = []
        if self.candidate_episodes:
            parts.append("=== Candidate History ===\n" + "\n".join(self.candidate_episodes[:3]))
        if self.relevant_procedures:
            parts.append("=== Interview Strategy ===\n" + "\n".join(self.relevant_procedures[:2]))
        if self.semantic_hits:
            parts.append("=== Relevant Past Context ===\n" + "\n".join(self.semantic_hits[:2]))
        return "\n\n".join(parts) if parts else ""


class MemoryAgent:
    """
    Spoke agent: Memory system manager.
    Abstracts all 4 tiers behind a clean interface.
    Hub calls retrieve() at start and write_episode() at end.
    """

    def __init__(self, session_id: str, candidate_id: str = None, db_session=None, ai_client=None):
        self.session_id   = session_id
        self.candidate_id = candidate_id
        self.db_session   = db_session
        self.ai_client    = ai_client
        self._procedures  = self._load_procedures()
        log.info("[MemoryAgent] Initialized — candidate=%s", candidate_id)

    def _load_procedures(self) -> dict:
        """Tier 4: Load procedural memory (question strategies per role)."""
        try:
            with open(PROCEDURES_PATH) as f:
                return json.load(f)
        except FileNotFoundError:
            log.warning("[MemoryAgent] procedures.json not found — using empty strategies")
            return {}

    def _load_episodic(self) -> list[str]:
        """
        Tier 2: Retrieve episodic summaries for this candidate from DB.
        In production: query EpisodicMemory table by candidate_id.
        """
        if not self.db_session or not self.candidate_id:
            return []
        try:
            from database import EpisodicMemory
            rows = (
                self.db_session.query(EpisodicMemory)
                .filter_by(candidate_id=self.candidate_id)
                .order_by(EpisodicMemory.created_at.desc())
                .limit(3)
                .all()
            )
            return [r.summary_text for r in rows]
        except Exception as e:
            log.warning("[MemoryAgent] Episodic load error: %s", e)
            return []

    def _vector_search(self, query: str, top_k: int = 2) -> list[str]:
        """
        Tier 3: Semantic search in FAISS vector index.
        In production: full embedding + FAISS similarity search.
        Here: stub returning empty (FAISS optional dependency).
        """
        try:
            from memory.vector_store import VectorStore
            vs = VectorStore()
            return vs.search(query, top_k=top_k)
        except ImportError:
            return []
        except Exception as e:
            log.warning("[MemoryAgent] Vector search error: %s", e)
            return []

    def retrieve(self, job_role: str = "software_engineer", query: str = "") -> MemoryContext:
        """
        Hub calls this at session start.
        Returns a MemoryContext with all relevant information injected.
        """
        episodes   = self._load_episodic()
        procedures = self._procedures.get(job_role, self._procedures.get("default", []))
        hits       = self._vector_search(query) if query else []

        ctx = MemoryContext(
            candidate_episodes  = episodes,
            relevant_procedures = procedures,
            semantic_hits       = hits,
            context_injected    = bool(episodes or procedures or hits),
        )
        log.info("[MemoryAgent] Retrieved: %d episodes, %d procedures, %d semantic hits",
                 len(episodes), len(procedures), len(hits))
        return ctx

    async def write_episode(self, conversation: list[dict], risk_summary: dict):
        """
        Hub calls this at session end.
        Tier 2: Summarize the session and persist to EpisodicMemory.
        Tier 3: Write embedding to vector index.
        """
        if not self.ai_client:
            log.warning("[MemoryAgent] No AI client — skipping episodic write")
            return

        # Summarize the full conversation into a concise episode
        try:
            transcript = "\n".join(
                f"{m['role'].upper()}: {m['content']}" for m in conversation[-30:]
            )
            resp = await self.ai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{
                    "role": "system",
                    "content": (
                        "Summarize this interview session in 3-5 sentences. "
                        "Focus on: candidate's technical depth, communication quality, "
                        "key strengths/weaknesses observed, and integrity notes. "
                        "Be objective and specific."
                    ),
                }, {
                    "role": "user",
                    "content": f"TRANSCRIPT:\n{transcript}\n\nRISK SUMMARY:\n{json.dumps(risk_summary)}",
                }],
                max_tokens=200,
                temperature=0.3,
            )
            summary = resp.choices[0].message.content

            # Persist to DB (Tier 2)
            if self.db_session and self.candidate_id:
                from database import EpisodicMemory
                episode = EpisodicMemory(
                    candidate_id  = self.candidate_id,
                    session_id    = self.session_id,
                    summary_text  = summary,
                    risk_snapshot = json.dumps(risk_summary),
                )
                self.db_session.add(episode)
                self.db_session.commit()
                log.info("[MemoryAgent] Episodic summary written to DB")

            # Index in vector store (Tier 3)
            try:
                from memory.vector_store import VectorStore
                vs = VectorStore()
                vs.add(summary, metadata={"session_id": self.session_id})
            except ImportError:
                pass

        except Exception as e:
            log.error("[MemoryAgent] Episode write failed: %s", e, exc_info=True)
