"""
mcp/github_server.py — GitHub MCP Server
Scrapes candidate GitHub profiles to auto-generate personalized questions.

Provides:
  - get_candidate_repos:        list public repos, languages, stars
  - get_repo_readme:            fetch README content for context
  - generate_personalized_qs:   use scraped data → generate targeted questions

Security:
  - Rate-limited: max 10 API calls per session
  - Only accesses public GitHub data
  - No tokens stored — uses unauthenticated API (60 req/hr per IP)
  - In production: use GitHub OAuth App token with read:user scope only

Architecture:
  This server runs as an on-demand subprocess in production (true MCP stdio),
  here implemented as an in-process adapter for simplicity.
"""
import asyncio
import json
import logging
import httpx
from .client import MCPServer, MCPTool

log = logging.getLogger("aegis.mcp.github")

GITHUB_API = "https://api.github.com"
MAX_CALLS_PER_SESSION = 10


def _build_github_server(ai_client=None) -> MCPServer:
    server = MCPServer(name="github")
    call_count = {"n": 0}
    # H-8: Instance-specific lock to prevent cross-request race conditions
    _rate_lock = asyncio.Lock()

    async def _rate_limit_check():
        async with _rate_lock:
            call_count["n"] += 1
            if call_count["n"] > MAX_CALLS_PER_SESSION:
                raise RuntimeError(f"GitHub MCP rate limit exceeded ({MAX_CALLS_PER_SESSION} calls/session)")

    # ── Tool: get_candidate_repos ────────────────────────────────────────────
    async def get_candidate_repos(github_username: str) -> list[dict]:
        """Fetch public repos and infer technology stack."""
        await _rate_limit_check()
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(
                    f"{GITHUB_API}/users/{github_username}/repos",
                    params={"sort": "updated", "per_page": 10},
                    headers={"Accept": "application/vnd.github.v3+json", "User-Agent": "AegisInterview/1.0"},
                )
                if resp.status_code != 200:
                    return [{"error": f"GitHub API {resp.status_code}"}]
                repos = resp.json()
                return [{
                    "name":        r["name"],
                    "language":    r.get("language", "Unknown"),
                    "stars":       r["stargazers_count"],
                    "description": r.get("description", "")[:150],
                    "topics":      r.get("topics", []),
                    "updated":     r["updated_at"][:10],
                } for r in repos if not r["fork"]]
        except ImportError:
            log.warning("[github/get_candidate_repos] httpx not installed — returning mock")
            return [{"name": "portfolio-project", "language": "Python", "stars": 12, "description": "ML pipeline"}]
        except Exception as e:
            log.error("[github/get_candidate_repos] %s", e)
            return []

    server.register(MCPTool(
        name        = "get_candidate_repos",
        description = "Fetch a candidate's public GitHub repositories to understand their technology stack.",
        parameters  = {"github_username": {"type": "string", "description": "GitHub username"}},
        handler     = get_candidate_repos,
    ))

    # ── Tool: generate_personalized_questions ────────────────────────────────
    async def generate_personalized_questions(github_username: str, job_description: str = "") -> list[str]:
        """Use candidate's GitHub data to generate hyper-personalized questions."""
        await _rate_limit_check()

        # First, get their repos
        repos = await get_candidate_repos(github_username)
        if not repos or "error" in repos[0]:
            return ["Tell me about a recent project you're proud of."]

        # Build context
        repo_summary = "; ".join(
            f"{r['name']} ({r.get('language','?')}): {r.get('description','')}"
            for r in repos[:5]
        )

        if ai_client:
            try:
                resp = await ai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{
                        "role": "system",
                        "content": (
                            "You are a senior technical interviewer. "
                            "Generate 4 highly specific technical interview questions "
                            "based on the candidate's actual GitHub projects. "
                            "Questions must be specific to their real code and stack, not generic. "
                            "Return ONLY a JSON array of question strings."
                        ),
                    }, {
                        "role": "user",
                        "content": (
                            f"GitHub repos: {repo_summary}\n"
                            f"Job description: {job_description or 'Senior Software Engineer'}\n\n"
                            "Generate 4 personalized questions:"
                        ),
                    }],
                    max_tokens=400,
                    temperature=0.6,
                    response_format={"type": "json_object"},
                )
                data = json.loads(resp.choices[0].message.content)
                questions = data if isinstance(data, list) else data.get("questions", [])
                return questions[:4]
            except Exception as e:
                log.warning("[github/gen_questions] AI failed: %s", e)

        # Offline fallback — generate repo-specific questions without AI
        questions = []
        for r in repos[:3]:
            lang = r.get("language", "code")
            name = r["name"]
            questions.append(
                f"I see your project '{name}' is written in {lang}. "
                f"What was the most challenging technical problem you solved in it?"
            )
        return questions or ["Walk me through your most significant technical project."]

    server.register(MCPTool(
        name        = "generate_personalized_questions",
        description = "Generate personalized interview questions based on a candidate's GitHub activity.",
        parameters  = {
            "github_username": {"type": "string", "description": "GitHub username"},
            "job_description": {"type": "string", "description": "Target job role description"},
        },
        handler = generate_personalized_questions,
    ))

    log.info("[MCPServer/github] Registered %d tools", len(server.tools))
    return server
