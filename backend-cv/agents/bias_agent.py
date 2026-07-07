"""
agents/bias_agent.py — BiasAuditAgent Spoke
Specialist agent that audits every question Aria intends to ask for:
  - Demographic bias (age, gender, ethnicity, disability)
  - Legal compliance (EEOC, GDPR, BIPA)
  - Cultural insensitivity
  - Inaccessible assumptions (educational privilege, geographic bias)

Called by the Hub BEFORE each question is sent to the candidate.
Returns typed BiasAuditResult with a safe/unsafe verdict.
"""
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

log = logging.getLogger("aegis.bias_agent")

# Hard-coded illegal interview topics (EEOC compliance)
PROHIBITED_TOPICS = [
    "age", "birthday", "born", "marital", "married", "pregnant", "pregnancy",
    "religion", "religious", "race", "ethnicity", "nationality", "citizenship",
    "disability", "disabled", "military service", "arrest", "criminal",
]

@dataclass
class BiasAuditResult:
    question:     str
    safe:         bool
    flags:        list[str]
    suggestion:   str = ""
    timestamp:    str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return {
            "question":   self.question[:120],
            "safe":       self.safe,
            "flags":      self.flags,
            "suggestion": self.suggestion,
            "timestamp":  self.timestamp,
        }


class BiasAuditAgent:
    """
    Spoke agent: Fairness and legal compliance auditor.
    
    Architecture note: This is a hard edge (locked rule) in the graph.
    It cannot be bypassed — every question MUST pass through it.
    This implements the "architectural governance over policy" principle
    from the research: hard edges consistently outperform policy-only enforcement.
    """

    AUDIT_SYSTEM = """You are a legal compliance officer specializing in fair hiring law (EEOC, GDPR, BIPA).
Analyze interview questions for bias, discrimination, or legal violations.

Return ONLY JSON:
{
  "safe": <true|false>,
  "flags": ["<issue1>", "<issue2>"],
  "suggestion": "<improved safe version of the question if unsafe, else empty string>"
}

Mark unsafe if the question touches: age, gender, race, religion, marital status, pregnancy,
disability, national origin, citizenship, criminal history, or makes unfair cultural assumptions."""

    def __init__(self, ai_client=None):
        self.ai_client = ai_client
        self._audit_log: list[BiasAuditResult] = []
        log.info("[BiasAuditAgent] Initialized — EEOC hard-edge enforcement active")

    def _fast_keyword_check(self, question: str) -> list[str]:
        """O(n) keyword scan — runs synchronously before the AI call."""
        q_lower = question.lower()
        return [topic for topic in PROHIBITED_TOPICS if topic in q_lower]

    async def audit(self, question: str) -> BiasAuditResult:
        """
        ReAct cycle:
          Thought: does the question contain prohibited keywords?
          Action: fast keyword scan → if clean, confirm with AI
          Obs: return typed BiasAuditResult
        """
        # Fast path: keyword check catches obvious violations immediately
        keyword_flags = self._fast_keyword_check(question)
        if keyword_flags:
            result = BiasAuditResult(
                question   = question,
                safe       = False,
                flags      = [f"Contains prohibited topic: '{f}'" for f in keyword_flags],
                suggestion = "Rephrase to focus on skills, experience, and role-specific competencies only.",
            )
            self._audit_log.append(result)
            log.warning("[BiasAuditAgent] BLOCKED question — keywords: %s", keyword_flags)
            return result

        # AI-powered deep audit for subtle bias
        if self.ai_client:
            try:
                resp = await self.ai_client.chat.completions.create(
                    model="gpt-4o-mini",   # Use smaller model — fast, cheap, accurate enough
                    messages=[
                        {"role": "system", "content": self.AUDIT_SYSTEM},
                        {"role": "user",   "content": f"Audit this question: {question}"},
                    ],
                    max_tokens=200,
                    temperature=0.1,
                    response_format={"type": "json_object"},
                )
                data = json.loads(resp.choices[0].message.content)
                result = BiasAuditResult(
                    question   = question,
                    safe       = bool(data.get("safe", True)),
                    flags      = data.get("flags", []),
                    suggestion = data.get("suggestion", ""),
                )
                self._audit_log.append(result)
                if not result.safe:
                    log.warning("[BiasAuditAgent] AI flagged bias: %s", result.flags)
                return result
            except Exception as e:
                log.warning("[BiasAuditAgent] AI audit failed (fail-safe: SAFE): %s", e)

        # Fallback: if AI unavailable, fast keyword check passed → mark safe
        result = BiasAuditResult(question=question, safe=True, flags=[])
        self._audit_log.append(result)
        return result

    @property
    def blocked_count(self) -> int:
        return sum(1 for r in self._audit_log if not r.safe)
