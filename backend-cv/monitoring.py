import os
import time
from typing import Any

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from prometheus_client import Counter, Gauge, Histogram, generate_latest
from fastapi import FastAPI, Response


def setup_observability(app: FastAPI) -> None:
    service_name = os.getenv("OTEL_SERVICE_NAME", "aegis-backend")

    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)

    otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
    if otlp_endpoint:
        exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
        provider.add_span_processor(BatchSpanProcessor(exporter))

    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app)


# H-6: Strip dynamic path segments to prevent label cardinality explosion
_SANITIZED_PATHS: dict[str, str] = {}

def _sanitize_path(path: str) -> str:
    if path in _SANITIZED_PATHS:
        return _SANITIZED_PATHS[path]
    parts = path.strip("/").split("/")
    sanitized = "/" + "/".join(
        p if not (p and (len(p) == 36 and p.count("-") == 4)) else "{id}"
        for p in parts
    )
    _SANITIZED_PATHS[path] = sanitized
    return sanitized


class MetricsMiddleware:
    def __init__(self, app: FastAPI):
        self.app = app

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.time()
        await self.app(scope, receive, send)
        duration = time.time() - start

        path = scope.get("path", "/unknown")
        safe_path = _sanitize_path(path)
        HTTP_REQUEST_DURATION.labels(path=safe_path).observe(duration)
        HTTP_REQUESTS_TOTAL.labels(path=safe_path).inc()


HTTP_REQUESTS_TOTAL = Counter(
    "aegis_http_requests_total",
    "Total HTTP requests",
    ["path"],
)

HTTP_REQUEST_DURATION = Histogram(
    "aegis_http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["path"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

WS_MESSAGES_TOTAL = Counter(
    "aegis_ws_messages_total",
    "Total WebSocket messages",
    ["endpoint"],
)

WS_LATENCY = Histogram(
    "aegis_ws_latency_seconds",
    "WebSocket message processing latency",
    ["endpoint"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5),
)

SESSIONS_ACTIVE = Gauge(
    "aegis_sessions_active",
    "Currently active interview sessions",
)

RISK_EVENTS_TOTAL = Counter(
    "aegis_risk_events_total",
    "Total risk events by severity",
    ["severity"],
)

INTEGRITY_SCORE = Gauge(
    "aegis_integrity_score",
    "Session integrity score (H-6: cardinality-safe — no session_id label)",
)


def metrics_endpoint() -> Response:
    return Response(content=generate_latest(), media_type="text/plain")


def tag_span_with_session(session_id: str):
    """Tag the current OpenTelemetry span with a session_id attribute."""
    span = trace.get_current_span()
    if span and span.is_recording():
        span.set_attribute("session.id", session_id)
