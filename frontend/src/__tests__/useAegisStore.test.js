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

  it('should reduce score for HIGH severity events', () => {
    useAegisStore.getState().addRiskEvent({ type: 'TEST', severity: 'HIGH', desc: 'test' });
    expect(useAegisStore.getState().integrityScore).toBe(88);
  });

  it('should not trigger lockdown for single MEDIUM event', () => {
    useAegisStore.getState().addRiskEvent({ type: 'TEST', severity: 'MEDIUM', desc: 'test' });
    expect(useAegisStore.getState().strictMandatoryLockdown).toBe(false);
  });

  it('should trigger lockdown for 2+ MEDIUM events', () => {
    useAegisStore.getState().addRiskEvent({ type: 'TEST', severity: 'MEDIUM', desc: 'test1' });
    useAegisStore.getState().addRiskEvent({ type: 'TEST', severity: 'MEDIUM', desc: 'test2' });
    expect(useAegisStore.getState().strictMandatoryLockdown).toBe(true);
  });
});
