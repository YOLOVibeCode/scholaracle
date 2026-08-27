import { SystemGuidanceClock } from './SystemGuidanceClock';

describe('SystemGuidanceClock', () => {
  it('returns a current Date and a local hour 0–23', () => {
    const clock = new SystemGuidanceClock();
    const now = clock.now();
    expect(now).toBeInstanceOf(Date);
    const hour = clock.localHour('America/New_York');
    expect(hour).toBeGreaterThanOrEqual(0);
    expect(hour).toBeLessThan(24);
  });
});
