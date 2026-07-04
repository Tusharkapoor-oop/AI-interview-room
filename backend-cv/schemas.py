from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field, field_validator


class LoginRequest(BaseModel):
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserCreate(BaseModel):
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    role: str = Field("CANDIDATE", pattern=r"^(CANDIDATE|RECRUITER|ADMIN)$")


class WSBaseMessage(BaseModel):
    type: str

    @field_validator("type")
    @classmethod
    def type_must_be_known(cls, v: str) -> str:
        allowed = {
            "telemetry_event", "audio_features", "keystroke_baseline",
            "user_message", "recruiter_decision", "ping", "pong",
        }
        if v not in allowed:
            raise ValueError(f"Unknown message type: {v}")
        return v


class WSTelemetryEvent(WSBaseMessage):
    type: str = "telemetry_event"
    event: dict[str, Any] = Field(default_factory=dict)


class WSAudioFeatures(WSBaseMessage):
    type: str = "audio_features"
    features: dict[str, Any] = Field(default_factory=dict)


class WSKeystrokeBaseline(WSBaseMessage):
    type: str = "keystroke_baseline"
    profile: dict[str, Any] = Field(default_factory=dict)


class WSUserMessage(WSBaseMessage):
    type: str = "user_message"
    message: str = Field(..., min_length=1, max_length=10000)


class WSRecruiterDecision(WSBaseMessage):
    type: str = "recruiter_decision"
    action: str = Field(..., pattern=r"^(CONTINUE|WARN_CANDIDATE|TERMINATE)$")
    session_id: str = Field(..., min_length=1)


class WSPing(WSBaseMessage):
    type: str = "ping"


class WSPong(WSBaseMessage):
    type: str = "pong"
    timestamp: float = Field(default_factory=lambda: datetime.now(timezone.utc).timestamp())


WS_MESSAGE_MODELS: dict[str, type[BaseModel]] = {
    "telemetry_event": WSTelemetryEvent,
    "audio_features": WSAudioFeatures,
    "keystroke_baseline": WSKeystrokeBaseline,
    "user_message": WSUserMessage,
    "recruiter_decision": WSRecruiterDecision,
    "ping": WSPing,
    "pong": WSPong,
}
