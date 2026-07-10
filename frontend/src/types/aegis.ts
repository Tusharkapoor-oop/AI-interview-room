import type React from 'react';

export interface PoseData {
  pitch: number;
  yaw: number;
  roll: number;
}

export interface EyeGaze {
  h: number;
  v: number;
}

export interface EARData {
  left: number;
  right: number;
}

export interface CVInferenceResult {
  status: "ok" | "error";
  gaze_anomaly: boolean;
  hands_visible: number;
  face_detected: boolean;
  face_count: number;
  severity: string | null;
  pose: PoseData;
  eye_gaze: EyeGaze;
  head_pose: PoseData;
  ear: EARData;
  hand_anomaly: boolean;
  hand_anomaly_desc: string;
  timestamp: string;
  integrity_score: number;
  security_fusion?: SecurityFusion;
  gaze_estimate?: unknown;
  liveness?: unknown;
  ks_anomalous?: unknown;
  gesture_event?: unknown;
  v4_ks_test?: { anomalous: boolean; alert: string | null };
  v4_whitespace?: { anomalous: boolean; alert: string | null };
  v4_liveness?: { passed: boolean; alert: string };
  v4_fusion?: {
    verdict: string;
    integrity_score: number;
    active_channels: number;
    description: string;
  };
}

export interface SecurityFusion {
  [key: string]: unknown;
}

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RiskEvent {
  event_type: string;
  severity: RiskSeverity;
  confidence: number | null;
  description: string;
  timestamp: string;
  pose?: { pitch: number; yaw: number; roll: number };
  hands_count?: number;
}

export type AgentStatusValue = "idle" | "active" | "error";

export interface AgentStatus {
  name: string;
  status: AgentStatusValue;
  last_active: string;
}

export type AppPhase =
  | "idle"
  | "calibration"
  | "interview"
  | "report"
  | "results"
  | "appeal"
  | "lockdown";

export interface AIScreen {
  condition: string;
  content: React.ReactNode;
}

export interface ChatMessage {
  role: "user" | "ai" | "system";
  message: string;
  timestamp: string;
}

export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

export interface WSTelemetryEvent extends WSMessage {
  type: "telemetry_event";
  event: Record<string, unknown>;
}

export interface WSAudioFeatures extends WSMessage {
  type: "audio_features";
  features: Record<string, unknown>;
}

export interface WSKeystrokeBaseline extends WSMessage {
  type: "keystroke_baseline";
  profile: Record<string, unknown>;
}

export interface WSUserMessage extends WSMessage {
  type: "user_message";
  message: string;
}

export type WSSendPayload =
  | WSTelemetryEvent
  | WSAudioFeatures
  | WSKeystrokeBaseline
  | WSUserMessage;

export interface AIResponseMessage {
  role: "ai";
  message: string;
  session_id: string;
  agent_statuses: Record<string, AgentStatus>;
  integrity_score: number;
  code_review?: CodeReviewResult;
}

export interface CodeReviewResult {
  files_reviewed: number;
  issues_found: number;
  summary: string;
  details?: Array<{
    file: string;
    line: number;
    severity: "error" | "warning" | "info";
    message: string;
  }>;
}
