import logging
import time
from typing import Any, Callable, Dict

log = logging.getLogger("aegis.circuit_breaker")


class CircuitBreakerState:
    __slots__ = ("failures", "last_failure_time", "is_open", "half_open_attempts")

    def __init__(self):
        self.failures: int = 0
        self.last_failure_time: float = 0.0
        self.is_open: bool = False
        self.half_open_attempts: int = 0


DEFAULT_OPTS = {
    "threshold": 3,
    "recovery_timeout": 30.0,
    "half_open_max_attempts": 2,
}


class AgentCircuitBreaker:
    def __init__(self, **opts):
        self.threshold = opts.get("threshold", DEFAULT_OPTS["threshold"])
        self.recovery_timeout = opts.get("recovery_timeout", DEFAULT_OPTS["recovery_timeout"])
        self.half_open_max_attempts = opts.get("half_open_max_attempts", DEFAULT_OPTS["half_open_max_attempts"])
        self._states: Dict[str, CircuitBreakerState] = {}

    def _get_state(self, agent_name: str) -> CircuitBreakerState:
        if agent_name not in self._states:
            self._states[agent_name] = CircuitBreakerState()
        return self._states[agent_name]

    async def call(self, agent_name: str, fn: Callable, fallback: Any = None) -> Any:
        state = self._get_state(agent_name)
        now = time.monotonic()

        if state.is_open:
            if now - state.last_failure_time > self.recovery_timeout:
                log.info("[CircuitBreaker] HALF-OPEN for agent %s", agent_name)
                state.is_open = False
                state.half_open_attempts = 0
            else:
                log.warning("[CircuitBreaker] OPEN — fast-failing agent %s", agent_name)
                return fallback

        try:
            result = await fn()
            self._on_success(state)
            return result
        except Exception as e:
            self._on_failure(state, agent_name, e)
            return fallback

    def _on_success(self, state: CircuitBreakerState) -> None:
        state.failures = 0
        state.half_open_attempts = 0

    def _on_failure(self, state: CircuitBreakerState, agent_name: str, error: Exception) -> None:
        state.failures += 1
        state.last_failure_time = time.monotonic()
        if state.failures >= self.threshold:
            state.is_open = True
            log.warning("[CircuitBreaker] OPENED for agent %s after %d failures: %s", agent_name, state.failures, error)

    def reset(self, agent_name: str) -> None:
        if agent_name in self._states:
            del self._states[agent_name]
            log.info("[CircuitBreaker] Reset state for agent %s", agent_name)

    def status(self, agent_name: str) -> str:
        state = self._get_state(agent_name)
        if state.is_open:
            remaining = max(0.0, self.recovery_timeout - (time.monotonic() - state.last_failure_time))
            return f"OPEN (recovery in {remaining:.0f}s)"
        return f"CLOSED ({state.failures}/{self.threshold} failures)"
