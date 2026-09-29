import { config } from '../src/config';

jest.mock('../src/temporal/client', () => ({
  // Simulates an unreachable Temporal server: start() never resolves.
  getTemporalClient: () => ({ workflow: { start: () => new Promise(() => {}) } }),
  checkTemporal: jest.fn(),
}));

import { defaultDeps, TemporalUnavailableError } from '../src/api/deps';

describe('defaultDeps.runWorkflow', () => {
  it('times out when workflow start hangs (Temporal unreachable)', async () => {
    const original = config.workflowTimeoutMs;
    config.workflowTimeoutMs = 100;
    try {
      const started = Date.now();
      await expect(defaultDeps.runWorkflow({ city: 'delhi' })).rejects.toBeInstanceOf(TemporalUnavailableError);
      expect(Date.now() - started).toBeLessThan(2000);
    } finally {
      config.workflowTimeoutMs = original;
    }
  });
});
