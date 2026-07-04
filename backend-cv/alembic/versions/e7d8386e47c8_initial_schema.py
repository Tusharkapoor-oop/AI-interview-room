"""initial_schema — full Aegis interview platform schema

Revision ID: e7d8386e47c8
Revises: 
Create Date: 2026-07-04 18:03:02.396668

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e7d8386e47c8'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'organizations',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('plan_tier', sa.String(), nullable=False, server_default='STARTER'),
        sa.Column('bipa_region', sa.String(), nullable=False, server_default='US'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'assessments',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('job_description', sa.Text(), nullable=True),
        sa.Column('strictness_level', sa.String(), nullable=False, server_default='STANDARD'),
        sa.Column('gaze_threshold', sa.Float(), nullable=False, server_default='18.0'),
        sa.Column('max_gaze_duration', sa.Float(), nullable=False, server_default='3.0'),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'candidates',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('first_name', sa.String(), nullable=False),
        sa.Column('last_name', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('github_url', sa.String(), nullable=True),
        sa.Column('linkedin_url', sa.String(), nullable=True),
        sa.Column('native_language', sa.String(), nullable=False, server_default='en'),
        sa.Column('region_code', sa.String(), nullable=False, server_default='US'),
        sa.Column('face_embedding_hash', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )
    op.create_index('ix_candidates_email', 'candidates', ['email'])
    op.create_table(
        'mcp_invocations',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('session_id', sa.String(), nullable=False),
        sa.Column('tool_path', sa.String(), nullable=False),
        sa.Column('params_keys', sa.String(), nullable=True),
        sa.Column('result_ok', sa.Boolean(), nullable=True),
        sa.Column('invoked_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_mcp_invocations_session', 'mcp_invocations', ['session_id'])
    op.create_table(
        'users',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('org_id', sa.String(), nullable=True),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('password_hash', sa.String(), nullable=False),
        sa.Column('role', sa.String(), nullable=False, server_default='CANDIDATE'),
        sa.Column('preferred_language', sa.String(), nullable=False, server_default='en'),
        sa.Column('timezone', sa.String(), nullable=False, server_default='UTC'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('last_login', sa.DateTime(), nullable=True),
        sa.Column('accommodation_mode', sa.Boolean(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )
    op.create_index('ix_users_email', 'users', ['email'])
    op.create_table(
        'sessions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('candidate_id', sa.String(), nullable=True),
        sa.Column('assessment_id', sa.String(), nullable=True),
        sa.Column('recruiter_id', sa.String(), nullable=True),
        sa.Column('data_residency_zone', sa.String(), nullable=False, server_default='us-east-1'),
        sa.Column('start_time', sa.DateTime(), nullable=True),
        sa.Column('end_time', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='PENDING'),
        sa.Column('trust_score', sa.Float(), nullable=True),
        sa.Column('anomaly_count', sa.Integer(), nullable=True),
        sa.Column('liveness_passed', sa.Boolean(), nullable=True),
        sa.Column('gaze_heatmap', sa.Text(), nullable=True),
        sa.Column('response_latency', sa.Float(), nullable=True),
        sa.Column('keystroke_profile', sa.Text(), nullable=True),
        sa.Column('video_s3_key', sa.String(), nullable=True),
        sa.Column('audio_s3_key', sa.String(), nullable=True),
        sa.Column('report_s3_key', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['candidate_id'], ['candidates.id'], ),
        sa.ForeignKeyConstraint(['assessment_id'], ['assessments.id'], ),
        sa.ForeignKeyConstraint(['recruiter_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'telemetry_events',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('session_id', sa.String(), nullable=False),
        sa.Column('event_type', sa.String(), nullable=False),
        sa.Column('severity', sa.String(), nullable=False, server_default='MEDIUM'),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('pitch', sa.Float(), nullable=True),
        sa.Column('yaw', sa.Float(), nullable=True),
        sa.Column('roll', sa.Float(), nullable=True),
        sa.Column('hands_count', sa.Integer(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['session_id'], ['sessions.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_telemetry_session_time', 'telemetry_events', ['session_id', 'timestamp'])
    op.create_table(
        'biometric_baselines',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('session_id', sa.String(), nullable=False),
        sa.Column('baseline_pitch', sa.Float(), nullable=True),
        sa.Column('baseline_yaw', sa.Float(), nullable=True),
        sa.Column('lighting_lux', sa.Float(), nullable=True),
        sa.Column('face_lm_quality', sa.Float(), nullable=True),
        sa.Column('calibrated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['session_id'], ['sessions.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('session_id'),
    )
    op.create_table(
        'episodic_memory',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('candidate_id', sa.String(), nullable=False),
        sa.Column('session_id', sa.String(), nullable=False),
        sa.Column('summary_text', sa.Text(), nullable=False),
        sa.Column('risk_snapshot', sa.Text(), nullable=True),
        sa.Column('embedding_ref', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['candidate_id'], ['candidates.id'], ),
        sa.ForeignKeyConstraint(['session_id'], ['sessions.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_episodic_memory_candidate', 'episodic_memory', ['candidate_id'])
    op.create_table(
        'agent_artifacts',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('session_id', sa.String(), nullable=False),
        sa.Column('agent_name', sa.String(), nullable=False),
        sa.Column('artifact_type', sa.String(), nullable=False),
        sa.Column('content_json', sa.Text(), nullable=True),
        sa.Column('s3_key', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['session_id'], ['sessions.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_agent_artifacts_session', 'agent_artifacts', ['session_id'])


def downgrade() -> None:
    op.drop_table('agent_artifacts')
    op.drop_table('episodic_memory')
    op.drop_table('biometric_baselines')
    op.drop_table('telemetry_events')
    op.drop_table('sessions')
    op.drop_table('users')
    op.drop_table('mcp_invocations')
    op.drop_table('candidates')
    op.drop_table('assessments')
    op.drop_table('organizations')
