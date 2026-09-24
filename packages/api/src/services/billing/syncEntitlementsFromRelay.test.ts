import { syncEntitlementsFromRelay } from './syncEntitlementsFromRelay';

describe('syncEntitlementsFromRelay', () => {
  it('creates subscription from relay grant', async () => {
    const createSubscription = jest.fn().mockResolvedValue(undefined);
    const findSubscription = jest.fn().mockResolvedValue(null);

    const result = await syncEntitlementsFromRelay(
      'user-1',
      [{ plan: 'solo', status: 'active', billingCycle: 'monthly' }],
      { findSubscription, createSubscription, updateSubscription: jest.fn() }
    );

    expect(result?.plan).toBe('premium');
    expect(createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', plan: 'premium', status: 'active' })
    );
  });
});
