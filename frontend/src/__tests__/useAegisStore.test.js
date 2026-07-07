import { describe, it, expect, beforeEach } from 'vitest';
import { useAegisStore } from '../useAegisStore';

describe('useAegisStore', () => {
  beforeEach(() => {
    useAegisStore.setState({
      riskEvents: [],
      integrityScore: 100,
      strictMandatoryLockdown: false,
      phase: 'interview',
    });
  });

  it('should start with default score of 100', () => {
    expect(useAegisStore.getState().integrityScore).toBe(100);
  });

  it('should update score when setServerIntegrityScore is called by backend telemetry', () => {
    useAegisStore.getState().setServerIntegrityScore(88);
    expect(useAegisStore.getState().integrityScore).toBe(88);
  });

  it('should not trigger lockdown for single MEDIUM event', () => {
    useAegisStore.getState().addRiskEvent({ type: 'TEST', severity: 'MEDIUM', desc: 'test' });
    expect(useAegisStore.getState().strictMandatoryLockdown).toBe(false);
  });

  it('should trigger lockdown when server integrity score drops below 40', () => {
    useAegisStore.getState().setServerIntegrityScore(35);
    expect(useAegisStore.getState().strictMandatoryLockdown).toBe(true);
  });
});
