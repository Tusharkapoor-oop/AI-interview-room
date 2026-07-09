/**
 * stores.js — Reactive store selectors for useAegisStore.
 * Fine-grained subscriptions prevent full re-renders on every state change.
 */
import { useAegisStore } from './useAegisStore';

export const useIntegrityScore = () => useAegisStore(s => s.integrityScore);

export const usePhase = () => useAegisStore(s => s.phase);

export const useMessages = () => useAegisStore(s => s.messages);

export const useTelemetry = () => useAegisStore(s => s.telemetry);

export const useRiskEvents = () => useAegisStore(s => s.riskEvents);

export const useSessionSeconds = () => useAegisStore(s => s.sessionSeconds);

export const useGhostViewEnabled = () => useAegisStore(s => s.ghostViewEnabled);

export const useAccommodationMode = () => useAegisStore(s => s.accommodationRequested || s.relaxedProctoringEnabled);

export const useCameraStream = () => useAegisStore(s => s._cameraStream);
