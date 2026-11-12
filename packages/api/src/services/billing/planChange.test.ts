import { classifyPlanChange, planLimitBlocksDowngrade } from './planChange';

describe('classifyPlanChange', () => {
  it('charges immediately when moving to a higher student cap', () => {
    expect(
      classifyPlanChange({
        currentPlan: 'starter',
        currentCycle: 'monthly',
        targetPlan: 'premium',
        targetCycle: 'monthly',
      })
    ).toEqual({ effective: 'now', isUpgrade: true });
  });

  it('defers downgrades to the next period', () => {
    expect(
      classifyPlanChange({
        currentPlan: 'family',
        currentCycle: 'annual',
        targetPlan: 'premium',
        targetCycle: 'annual',
      })
    ).toEqual({ effective: 'next_period', isUpgrade: false });
  });

  it('treats monthly to annual on the same tier as an immediate upgrade', () => {
    expect(
      classifyPlanChange({
        currentPlan: 'premium',
        currentCycle: 'monthly',
        targetPlan: 'premium',
        targetCycle: 'annual',
      })
    ).toEqual({ effective: 'now', isUpgrade: true });
  });

  it('defers annual to monthly on the same tier', () => {
    expect(
      classifyPlanChange({
        currentPlan: 'starter',
        currentCycle: 'annual',
        targetPlan: 'starter',
        targetCycle: 'monthly',
      })
    ).toEqual({ effective: 'next_period', isUpgrade: false });
  });
});

describe('planLimitBlocksDowngrade', () => {
  it('blocks when the household has more students than the target plan allows', () => {
    expect(planLimitBlocksDowngrade('starter', 2)).toBe(true);
    expect(planLimitBlocksDowngrade('premium', 2)).toBe(false);
  });
});
