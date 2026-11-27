import { SystemGuidanceClock } from './SystemGuidanceClock';

describe('SystemGuidanceClock', () => {
  it('tells the time now', () => {
    const before = Date.now();
    const now = new SystemGuidanceClock().now();
    const after = Date.now();

    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });
});
