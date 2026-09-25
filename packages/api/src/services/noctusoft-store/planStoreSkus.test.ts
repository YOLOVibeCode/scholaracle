import { resolveStoreSku } from './planStoreSkus';

describe('resolveStoreSku', () => {
  it('maps starter monthly', () => {
    expect(resolveStoreSku('starter', 'monthly')).toBe('NOCTU-SCHOLARMANCY-STARTER-MONTHLY');
  });

  it('maps premium annual', () => {
    expect(resolveStoreSku('premium', 'annual')).toBe('NOCTU-SCHOLARMANCY-PREMIUM-ANNUAL');
  });

  it('throws for free plan', () => {
    expect(() => resolveStoreSku('free', 'monthly')).toThrow(/Free plan/);
  });
});
