import { planFromStoreSku, resolveStoreSku } from './planStoreSkus';

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

describe('planFromStoreSku', () => {
  it('reads an item code', () => {
    expect(planFromStoreSku('NOCTU-SCHOLARMANCY-FAMILY-ANNUAL')).toEqual({
      plan: 'family',
      billingCycle: 'annual',
    });
  });

  it('reads a catalog key', () => {
    expect(planFromStoreSku('starter-monthly')).toEqual({
      plan: 'starter',
      billingCycle: 'monthly',
    });
  });

  it('round-trips every plan and cycle', () => {
    for (const plan of ['starter', 'premium', 'family', 'enterprise'] as const) {
      for (const billingCycle of ['monthly', 'annual'] as const) {
        expect(planFromStoreSku(resolveStoreSku(plan, billingCycle))).toEqual({
          plan,
          billingCycle,
        });
      }
    }
  });

  it('returns null for an unknown or missing sku', () => {
    expect(planFromStoreSku('NOCTU-OTHER-THING')).toBeNull();
    expect(planFromStoreSku(null)).toBeNull();
  });
});
