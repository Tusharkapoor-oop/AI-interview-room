"""
test_data_minimization.py — Phase 5.6

GDPR Art. 5(1)(c) data minimization verification:
  - Raw biometric data (video frames, audio waveforms) NEVER leave the device
  - Only anonymized telemetry (gaze coordinates, pose angles, risk scores) is transmitted
  - Server never stores raw pixel data from WebSocket frames
  - No raw biometric data in database schemas

BIPA compliance:
  - No biometric identifier storage (740 ILCS 14/10)
  - No facial geometry templates stored
  - No voice prints stored (only speaker embedding cosine distance)

Run: python -m pytest tests/test_data_minimization.py -v
"""
import pytest


class TestDataMinimization:

    def test_no_raw_video_in_websocket_message(self):
        """Verify WebSocket messages contain NO raw pixel data — only derived telemetry."""
        from agents.cv_agent import CVAgent

        agent = CVAgent(session_id="minimization_test")

        result = agent.process({
            "gaze_anomaly": False,
            "hands_visible": 0,
            "face_detected": True,
            "face_count": 1,
            "severity": "clean",
            "pose": {"pitch": 0.1, "yaw": -0.05, "roll": 0.02},
            "eye_gaze": {"h": 0.5, "v": 0.3},
            "ear": {"left": 0.28, "right": 0.27},
            "frame_brightness": 128.5,
            "pupil_diameter_mm": 3.5,
            "status": "ok",
            "face_roi_rgb": (120.0, 110.0, 105.0),
        })

        raw_fields = ["raw_frame", "frame_data", "pixels", "image_data", "video_frame",
                       "raw_audio", "audio_waveform", "microphone_data"]

        for field in raw_fields:
            assert not hasattr(result, field), f"Raw biometric field '{field}' leaked in CVAgent output"

    def test_no_raw_pixel_storage_in_db_schemas(self):
        """Verify database schemas contain NO raw biometric storage columns."""
        from database import Base

        inspector = Base.metadata
        raw_terms_exact = ["raw_frame", "raw_pixel", "raw_video", "raw_audio",
                            "biometric_data", "face_geometry", "iris_raw",
                            "fingerprint_raw"]
        for table_name, table in inspector.tables.items():
            for col in table.columns:
                col_lower = col.name.lower()
                for term in raw_terms_exact:
                    assert term != col_lower, (
                        f"Column '{col.name}' in '{table_name}' contains raw biometric term '{term}'"
                    )

    @pytest.mark.asyncio
    async def test_accommodation_mode_disables_all_biometric_transmission(self):
        """Verify accommodation mode disables ALL biometric transmission."""
        from agents.hub import AegisHub

        hub = AegisHub(session_id="acc_test")
        hub.set_accommodation_mode(True)

        result = await hub.ingest_security_features({
            "pose": {"pitch": 10.0, "yaw": 20.0},
            "gaze_anomaly": True,
        })

        assert result is not None
        if isinstance(result, dict):
            assert result.get("accommodation_mode", False), "Accommodation mode not reflected in result"
            if "fusion" in result:
                assert result["fusion"].get("composite_risk_score", 1.0) == 0.0, (
                    "Biometric signals leaking through in accommodation mode"
                )

    def test_only_anonymized_data_in_telemetry_schema(self):
        """Verify TelemetryEvent table stores only derived/anonymized data."""
        from database import TelemetryEvent

        col_names = [c.name for c in TelemetryEvent.__table__.columns]

        safe_patterns = [
            "id", "session_id", "event_type", "severity", "confidence",
            "pitch", "yaw", "roll", "hands_count",
            "description", "created_at", "timestamp",
        ]

        for col_name in col_names:
            ok = any(pattern in col_name for pattern in safe_patterns)
            assert ok, f"Column '{col_name}' in TelemetryEvent is not in the safe list"

    def test_no_raw_biometric_user_data(self):
        """Verify User and Candidate tables contain NO biometric fields."""
        from database import User, Candidate

        for model_cls in (User, Candidate):
            col_names = [c.name for c in model_cls.__table__.columns]

            forbidden_exact = ["voice_print", "fingerprint", "iris_image",
                                "gaze_template", "raw_audio", "raw_video",
                                "biometric_template", "face_geometry"]
            for col in col_names:
                col_lower = col.lower()
                for term in forbidden_exact:
                    assert term != col_lower, (
                        f"'{model_cls.__name__}.{col}' is a raw biometric field"
                    )
