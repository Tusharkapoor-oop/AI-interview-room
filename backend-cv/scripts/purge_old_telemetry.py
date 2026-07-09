"""
purge_old_telemetry.py — Phase 5.7

90-day auto-purge for raw telemetry (TelemetryEvent rows).
Designed to run as a cron job / scheduled Lambda.

Deletes all TelemetryEvent rows where ts < (now - 90 days)
and logs the count deleted. Safe to run on any schedule.

Usage:
    python scripts/purge_old_telemetry.py          # dry-run (--dry-run implied)
    python scripts/purge_old_telemetry.py --apply   # actual deletion
"""
import argparse
import logging
import os
import sys
from datetime import datetime, timedelta, timezone

# Ensure we can import from backend-cv root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import SessionLocal, TelemetryEvent

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

RETENTION_DAYS = int(os.getenv("TELEMETRY_RETENTION_DAYS", "90"))


def purge_telemetry(apply: bool = False) -> int:
    """Delete telemetry older than RETENTION_DAYS. Returns count of rows affected."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    log.info("Purging TelemetryEvent rows older than %s (retention=%d days)", cutoff.isoformat(), RETENTION_DAYS)

    db = SessionLocal()
    try:
        q = db.query(TelemetryEvent).filter(TelemetryEvent.ts < cutoff)
        count = q.count()
        log.info("Found %d rows to purge", count)

        if apply and count > 0:
            q.delete(synchronize_session=False)
            db.commit()
            log.info("Deleted %d rows", count)
        elif count > 0 and not apply:
            log.info("Dry-run mode — use --apply to perform deletion")
        else:
            log.info("No stale rows found")

        return count
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Purge old telemetry data (GDPR Art. 5(1)(c) data minimisation)")
    parser.add_argument("--apply", action="store_true", help="Actually delete rows (default: dry-run)")
    args = parser.parse_args()

    count = purge_telemetry(apply=args.apply)
    if args.apply:
        print(f"PURGE COMPLETE: {count} rows deleted")
    else:
        print(f"DRY-RUN: {count} rows would be deleted (pass --apply to execute)")


if __name__ == "__main__":
    main()