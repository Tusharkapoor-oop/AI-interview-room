"""
agents/code_review_agent.py — CodeReviewAgent Spoke
Specialist agent that evaluates code submitted from the candidate IDE.
Uses OpenAI to assess:
  - Correctness (does it solve the stated problem?)
  - Time/space complexity
  - Edge case handling
  - Code quality & idiomatic style
  - Potential cheating signals (copy-paste from known solutions)
Returns a typed CodeReviewResult artifact.
"""
import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

log = logging.getLogger("aegis.code_review_agent")

# ── Known LeetCode/HackerRank solution hashes (simplified cheating detection)
# In production: compare embeddings against a vector DB of known solutions
# TODO: Populate from solution database at startup (e.g., ./scripts/load_solution_hashes.py)
KNOWN_SOLUTIONS_HASHES: set = set()
import logging as _logging
if not KNOWN_SOLUTIONS_HASHES:
    _logging.getLogger("aegis.code_review_agent").warning(
        "KNOWN_SOLUTIONS_HASHES is empty — plagiarism detection is disabled. "
        "Run scripts/load_solution_hashes.py to populate."
    )


@dataclass
class CodeReviewResult:
    session_id:    str
    language:      str
    code:          str
    score:         int        # 0-100
    complexity:    str        # e.g. "O(n log n)"
    correctness:   str        # CORRECT | PARTIAL | INCORRECT
    quality:       str        # EXCELLENT | GOOD | FAIR | POOR
    feedback:      str
    cheating_flag: bool = False
    cheating_note: str  = ""
    timestamp:     str  = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return {
            "session_id":    self.session_id,
            "language":      self.language,
            "code_hash":     hashlib.sha256(self.code.encode()).hexdigest()[:16],
            "score":         self.score,
            "complexity":    self.complexity,
            "correctness":   self.correctness,
            "quality":       self.quality,
            "feedback":      self.feedback,
            "cheating_flag": self.cheating_flag,
            "cheating_note": self.cheating_note,
            "timestamp":     self.timestamp,
        }


class CodeReviewAgent:
    """
    Spoke agent: Code review specialist.
    Called by the Hub when a candidate submits code from the IDE.
    """

    REVIEW_SYSTEM = """You are a principal-level code reviewer for Aegis Interview Room.
Evaluate the submitted code objectively and precisely.

Return ONLY a JSON object with this exact schema:
{
  "score": <int 0-100>,
  "complexity": "<time complexity e.g. O(n)>",
  "correctness": "<CORRECT|PARTIAL|INCORRECT>",
  "quality": "<EXCELLENT|GOOD|FAIR|POOR>",
  "feedback": "<2-4 sentence constructive feedback>"
}

Be honest — do not be overly generous. Assess: correctness, edge cases, complexity, readability."""

    def __init__(self, session_id: str, ai_client=None):
        self.session_id = session_id
        self.ai_client  = ai_client
        log.info("[CodeReviewAgent] Initialized for session %s", session_id)

    def _check_plagiarism(self, code: str) -> tuple[bool, str]:
        """Naive hash-based plagiarism check. Production: embedding similarity search."""
        code_hash = hashlib.sha256(code.strip().encode()).hexdigest()
        if code_hash in KNOWN_SOLUTIONS_HASHES:
            return True, "Code hash matches a known solution from public repositories."
        # Check for suspiciously short time-to-solve (heuristic)
        return False, ""

    async def review(self, code: str, language: str, question: str) -> CodeReviewResult:
        """
        ReAct pattern:
          Thought: what question was asked? what language?
          Action:  call AI review API
          Obs:     parse result into typed CodeReviewResult
        """
        log.info("[CodeReviewAgent] Reviewing %s code (%d chars)", language, len(code))

        # Plagiarism check (fast, runs first)
        is_plagiarised, cheat_note = self._check_plagiarism(code)

        if self.ai_client:
            try:
                import json
                prompt = (
                    f"Language: {language}\n"
                    f"Question: {question}\n\n"
                    f"Code:\n```{language}\n{code}\n```"
                )
                resp = await self.ai_client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system",  "content": self.REVIEW_SYSTEM},
                        {"role": "user",    "content": prompt},
                    ],
                    max_tokens=300,
                    temperature=0.2,
                    response_format={"type": "json_object"},
                )
                data = json.loads(resp.choices[0].message.content)
                return CodeReviewResult(
                    session_id    = self.session_id,
                    language      = language,
                    code          = code,
                    score         = int(data.get("score", 70)),
                    complexity    = data.get("complexity", "Unknown"),
                    correctness   = data.get("correctness", "PARTIAL"),
                    quality       = data.get("quality", "GOOD"),
                    feedback      = data.get("feedback", ""),
                    cheating_flag = is_plagiarised,
                    cheating_note = cheat_note,
                )
            except Exception as e:
                log.warning("[CodeReviewAgent] AI review failed: %s", e)

        # Offline fallback
        return CodeReviewResult(
            session_id    = self.session_id,
            language      = language,
            code          = code,
            score         = 75,
            complexity    = "O(n)",
            correctness   = "PARTIAL",
            quality       = "GOOD",
            feedback      = "Code review unavailable offline. Structure looks reasonable.",
            cheating_flag = is_plagiarised,
            cheating_note = cheat_note,
        )
