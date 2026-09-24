import {
  mapAppPlanToRelayCheckoutPlan,
  mapRelayPlanToAppPlan,
  resolveAnnualOrderSku,
} from './relayPlanMapping';

describe('relayPlanMapping', () => {
  it('maps app plans to relay checkout slugs', () => {
    expect(mapAppPlanToRelayCheckoutPlan('starter')).toBe('starter');
    expect(mapAppPlanToRelayCheckoutPlan('premium')).toBe('solo');
    expect(mapAppPlanToRelayCheckoutPlan('family')).toBe('team');
    expect(mapAppPlanToRelayCheckoutPlan('enterprise')).toBe('business');
  });

  it('maps relay plans back to app plans', () => {
    expect(mapRelayPlanToAppPlan('solo')).toBe('premium');
    expect(mapRelayPlanToAppPlan('team')).toBe('family');
    expect(mapRelayPlanToAppPlan('business')).toBe('enterprise');
  });

  it('resolves annual SKU from catalog', () => {
    const sku = resolveAnnualOrderSku('premium', [
      { sku: 'NOCTU-SCHOLARMANCY-SOLO-MONTHLY', plan: 'solo', interval: 'monthly' },
      { sku: 'NOCTU-SCHOLARMANCY-SOLO-ANNUAL', plan: 'solo', interval: 'annual' },
    ]);
    expect(sku).toBe('NOCTU-SCHOLARMANCY-SOLO-ANNUAL');
  });
});
