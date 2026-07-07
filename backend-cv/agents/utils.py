from datetime import datetime, timezone


SEVERITY_PENALTY = {
    "CRITICAL": 15,
    "HIGH": 9,
    "MEDIUM": 5,
    "LOW": 2,
}

FRAUD_SIGNAL_MULTIPLIER = 1.5


def compute_integrity_score(events, now: float | None = None) -> int:
    if not events:
        return 100

    # Use monotonic-like wall time for decay — events carry isoformat timestamps
    if now is None:
        now = datetime.now(timezone.utc)

    total_penalty = 0.0
    decay_window = 300.0  # seconds — events older than 5min decay fully

    for e in events:
        severity = getattr(e, "severity", e.get("severity", "LOW"))
        is_fraud = getattr(e, "fraud_signal", e.get("fraud_signal", False))
        raw_ts = getattr(e, "timestamp", e.get("timestamp", ""))

        base = SEVERITY_PENALTY.get(severity, 2)

        # Time-decay: recent events hurt more
        if raw_ts and isinstance(raw_ts, str):
            try:
                ts = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
                age = abs((now - ts).total_seconds())
                decay = max(0.0, 1.0 - age / decay_window)
            except (ValueError, TypeError):
                decay = 1.0
        else:
            decay = 1.0

        penalty = base * decay
        if is_fraud:
            penalty *= FRAUD_SIGNAL_MULTIPLIER

        total_penalty += penalty

    raw = 100.0 - total_penalty
    return max(0, min(100, round(raw)))
