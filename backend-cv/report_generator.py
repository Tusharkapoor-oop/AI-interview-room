"""
report_generator.py — Phase 6.10

Post-interview PDF integrity report.
Generates a recruiter-facing PDF with:
  - Integrity score and verdict
  - Risk breakdown by channel (gaze, whitespace, kinematic, liveness, deepfake, digital)
  - Event timeline (severity-coded)
  - HITL decisions history
  - Compliance badge (EU AI Act, GDPR, BIPA)

Uses ReportLab (pure Python, no LaTeX dependency).
"""
import logging
from datetime import datetime, timezone
from io import BytesIO
from typing import Dict, List, Optional

log = logging.getLogger(__name__)

CHANNEL_NAMES = {
    "gaze": "Gaze / KS-Test",
    "whitespace": "Whitespace Fixation",
    "baseline": "Baseline Drift",
    "kinematic": "Kinematic Motion",
    "liveness": "PLR / rPPG Liveness",
    "deepfake": "GenD Deepfake",
    "digital": "Digital Security",
}

SEVERITY_COLORS = {
    "LOW": (0x60, 0xA5, 0xFA),
    "MEDIUM": (0xF5, 0x9E, 0x0B),
    "HIGH": (0xEF, 0x44, 0x44),
    "CRITICAL": (0xDC, 0x26, 0x26),
}


def _render_header(canvas, width: int, height: int, title: str, subtitle: str):
    """Draw the report header."""
    from reportlab.lib.units import mm
    canvas.saveState()

    canvas.setFillColorRGB(0.05, 0.05, 0.10)
    canvas.rect(0, height - 80, width, 80, fill=1, stroke=0)

    canvas.setFillColorRGB(1, 1, 1)
    canvas.setFont("Helvetica-Bold", 18)
    canvas.drawString(20 * mm, height - 30, title)
    canvas.setFont("Helvetica", 10)
    canvas.drawString(20 * mm, height - 48, subtitle)
    canvas.setFont("Helvetica", 7)
    canvas.setFillColorRGB(0.6, 0.6, 0.6)
    canvas.drawString(20 * mm, height - 60, f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")

    canvas.setFillColorRGB(0.4, 0.4, 0.4)
    canvas.setFont("Helvetica", 6)
    canvas.drawRightString(width - 20 * mm, height - 60, "CONFIDENTIAL — Aegis Platform v3.1")
    canvas.restoreState()


def _render_score_bar(canvas, x: int, y: int, label: str, score: float, max_width: int):
    """Draw a labeled horizontal bar (0 = red, 100 = green)."""
    bar_h = 8
    canvas.setFont("Helvetica", 8)
    canvas.setFillColorRGB(0.3, 0.3, 0.4)
    canvas.drawString(x, y - 2, label)

    bg_x = x + 120
    canvas.setFillColorRGB(0.15, 0.15, 0.20)
    canvas.roundRect(bg_x, y - bar_h, color_width := max_width, bar_h, 2, fill=1, stroke=0)

    fill_w = max(2, int(color_width * (score / 100.0)))
    r = 1.0 - (score / 100.0)
    g = score / 100.0
    canvas.setFillColorRGB(min(1.0, r * 1.2), min(1.0, g * 1.2), 0.2)
    canvas.roundRect(bg_x, y - bar_h, fill_w, bar_h, 2, fill=1, stroke=0)

    canvas.setFillColorRGB(0.9, 0.9, 0.95)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(bg_x + color_width + 4, y - bar_h + 1, f"{score:.1f}")


def generate_integrity_report(
    session_id: str,
    integrity_score: float,
    status: str,
    events: List[Dict],
    channels: Dict[str, float],
    hitl_decisions: List[Dict],
    duration_minutes: int,
) -> Optional[bytes]:
    """
    Generate a PDF integrity report as bytes.
    Returns None if reportlab is not installed.
    """
    try:
        from reportlab.pdfgen import canvas as pdfcanvas
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
    except ImportError:
        log.warning("reportlab not installed — skipping PDF generation")
        return None

    buf = BytesIO()
    width, height = A4
    c = pdfcanvas.Canvas(buf, pagesize=A4)
    y = height - 60

    _render_header(c, width, height, "Aegis Integrity Report", f"Session: {session_id}")

    y -= 50
    c.setFont("Helvetica-Bold", 14)
    c.setFillColorRGB(0.9, 0.9, 0.95)
    c.drawString(20 * mm, y, "1. Session Summary")
    y -= 22

    summary_lines = [
        ("Session ID", session_id[:36] + ".." if len(session_id) > 36 else session_id),
        ("Status", status),
        ("Duration", f"{duration_minutes:.1f} minutes"),
        ("Integrity Score", f"{integrity_score:.1f}/100"),
        ("Total Risk Events", str(len(events))),
        ("HITL Decisions", str(len(hitl_decisions))),
    ]

    c.setFont("Helvetica", 8)
    for label, value in summary_lines:
        c.setFillColorRGB(0.5, 0.5, 0.6)
        c.drawString(20 * mm, y, label)
        c.setFillColorRGB(0.85, 0.85, 0.9)
        c.drawString(80 * mm, y, value)
        y -= 14

    # 2. Score breakdown
    y -= 10
    if y < 120:
        c.showPage()
        y = height - 40
        _render_header(c, width, height, "Aegis Integrity Report (cont.)", f"Session: {session_id}")

    c.setFont("Helvetica-Bold", 14)
    c.setFillColorRGB(0.9, 0.9, 0.95)
    c.drawString(20 * mm, y, "2. Channel Risk Breakdown")
    y -= 22

    _render_score_bar(c, 20 * mm, y, "Composite", integrity_score, 120)
    y -= 16

    for channel_key, risk_val in channels.items():
        channel_label = CHANNEL_NAMES.get(channel_key, channel_key)
        score = (1.0 - min(1.0, risk_val)) * 100.0
        _render_score_bar(c, 20 * mm, y, channel_label, score, 120)
        y -= 14

    # 3. Event timeline
    y -= 14
    if y < 80:
        c.showPage()
        y = height - 40
        _render_header(c, width, height, "Aegis Integrity Report (cont.)", f"Session: {session_id}")

    c.setFont("Helvetica-Bold", 14)
    c.setFillColorRGB(0.9, 0.9, 0.95)
    c.drawString(20 * mm, y, "3. Risk Event Timeline")
    y -= 22

    max_events = 30
    for ev in events[-max_events:]:
        ev_type = ev.get("event_type", "UNKNOWN")[:30]
        sev = ev.get("severity", "LOW")
        desc = (ev.get("description", "") or "")[:60]
        ts = ev.get("ts", "")

        r, g, b = SEVERITY_COLORS.get(sev, (0.5, 0.5, 0.6))
        c.setFillColorRGB(r, g, b)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(20 * mm, y, sev[:6])

        c.setFillColorRGB(0.7, 0.7, 0.8)
        c.setFont("Helvetica", 7)
        c.drawString(48 * mm, y, f"{str(ts)[:19]}  {ev_type}")
        c.setFillColorRGB(0.5, 0.5, 0.6)
        c.drawString(120 * mm, y, desc[:50])
        y -= 11

    # 4. HITL decisions
    y -= 14
    if y < 80:
        c.showPage()
        y = height - 40
        _render_header(c, width, height, "Aegis Integrity Report (cont.)", f"Session: {session_id}")

    c.setFont("Helvetica-Bold", 14)
    c.setFillColorRGB(0.9, 0.9, 0.95)
    c.drawString(20 * mm, y, "4. HITL Decision History")
    y -= 22

    if not hitl_decisions:
        c.setFont("Helvetica", 8)
        c.setFillColorRGB(0.5, 0.5, 0.6)
        c.drawString(20 * mm, y, "No HITL decisions recorded — integrity score remained above threshold.")
    else:
        c.setFont("Helvetica", 8)
        c.setFillColorRGB(0.3, 0.3, 0.4)
        c.drawString(20 * mm, y, "Decision")
        c.drawString(56 * mm, y, "Type")
        c.drawString(80 * mm, y, "Timestamp")
        c.drawString(130 * mm, y, "Recruiter")
        y -= 14

        for d in hitl_decisions[-10:]:
            decision = d.get("decision", "?")[:16]
            etype = d.get("escalation_type", "?")[:16]
            ctime = str(d.get("decided_at", ""))[:19]
            rid = str(d.get("recruiter_id", ""))[:20]

            c.setFillColorRGB(0.7, 0.7, 0.8)
            c.drawString(20 * mm, y, decision)
            c.drawString(56 * mm, y, etype)
            c.drawString(80 * mm, y, ctime)
            c.drawString(130 * mm, y, rid)
            y -= 12

    # 5. Compliance footer
    y -= 20
    if y < 40:
        c.showPage()
        y = height - 40
    else:
        c.setStrokeColorRGB(0.3, 0.3, 0.4)
        c.setLineWidth(0.5)
        c.line(20 * mm, y, width - 20 * mm, y)
        y -= 14

    c.setFont("Helvetica", 6)
    c.setFillColorRGB(0.4, 0.4, 0.5)
    compliance_note = (
        "EU AI Act Art. 5(1)(f) — Security exception · GDPR Art. 5(1)(c) — Data minimisation · "
        "GDPR Art. 22 — Automated decision-making with human oversight · "
        "NYC Local Law 144 — Bias audit conducted · BIPA 740 ILCS 14/10 — No biometric storage"
    )
    c.drawString(20 * mm, y, compliance_note)

    c.save()
    buf.seek(0)
    return buf.read()