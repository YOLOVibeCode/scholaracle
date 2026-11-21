import {
  canChangeStorePlan,
  isSelfServePurchasablePlan,
  parseBillingCycle,
  planLimitBlocksDowngrade,
} from './planChange';

describe('canChangeStorePlan', () => {
  const sub = (storeSubscriptionId: string | undefined, active: boolean) => ({
    storeSubscriptionId,
    isActive: () => active,
  });

  it('allows a running paid store subscription', () => {
    expect(canChangeStorePlan(sub('sub_1', true))).toBe(true);
  });

  it('refuses a coupon trial or admin grant that has no store subscription', () => {
    expect(canChangeStorePlan(sub(undefined, true))).toBe(false);
  });

  it('refuses a past-due, paused or cancelled subscription', () => {
    expect(canChangeStorePlan(sub('sub_1', false))).toBe(false);
  });

  it('refuses a missing subscription', () => {
    expect(canChangeStorePlan(null)).toBe(false);
    expect(canChangeStorePlan(undefined)).toBe(false);
  });
});

describe('parseBillingCycle', () => {
  it('keeps the current cycle when the request names none', () => {
    expect(parseBillingCycle(undefined, 'annual')).toBe('annual');
    expect(parseBillingCycle(null, 'monthly')).toBe('monthly');
  });

  it('accepts monthly and annual', () => {
    expect(parseBillingCycle('monthly', 'annual')).toBe('monthly');
    expect(parseBillingCycle('annual', 'monthly')).toBe('annual');
  });

  it('rejects anything else instead of guessing monthly', () => {
    expect(parseBillingCycle('yearly', 'annual')).toBeNull();
    expect(parseBillingCycle('', 'annual')).toBeNull();
    expect(parseBillingCycle(12, 'annual')).toBeNull();
  });
});

describe('isSelfServePurchasablePlan', () => {
  it('accepts the three self-serve plans only', () => {
    expect(isSelfServePurchasablePlan('starter')).toBe(true);
    expect(isSelfServePurchasablePlan('premium')).toBe(true);
    expect(isSelfServePurchasablePlan('family')).toBe(true);
    expect(isSelfServePurchasablePlan('free')).toBe(false);
    expect(isSelfServePurchasablePlan('enterprise')).toBe(false);
    expect(isSelfServePurchasablePlan(undefined)).toBe(false);
  });
});

describe('planLimitBlocksDowngrade', () => {
  it('blocks when the household has more students than the target plan allows', () => {
    expect(planLimitBlocksDowngrade('starter', 2)).toBe(true);
    expect(planLimitBlocksDowngrade('premium', 2)).toBe(false);
  });
});

describe('planLimitBlocksDowngrade with unlimited plans', () => {
  it('never blocks a move to a plan with an unlimited student cap', () => {
    expect(planLimitBlocksDowngrade('enterprise', 50)).toBe(false);
  });
});
