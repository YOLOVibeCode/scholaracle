import type { ISubscriptionWire } from '@scholaracle/contracts';
import {
  PLAN_NEUTRAL_TEXT,
  buildPlanViewModel,
  formatPlanDate,
  planLabel,
  planManageLinks,
  showsEffectivePlanNote,
  studentsSummary,
} from './planViewModel';

const NOW = new Date('2026-11-08T12:00:00.000Z');

function sub(overrides: Partial<ISubscriptionWire>): ISubscriptionWire {
  return {
    plan: 'premium',
    status: 'active',
    effectivePlan: 'premium',
    maxStudents: 2,
    ...overrides,
  };
}

function vm(subscription: ISubscriptionWire, studentCount = 1) {
  return buildPlanViewModel({ subscription, studentCount, now: NOW });
}

describe('planManageLinks', () => {
  const urls = { pricing: 'https://x.test/pricing', billing: 'https://x.test/billing' };

  it('offers web links only for US locale', () => {
    const us = planManageLinks(true, urls);
    expect(us.links.map((l) => l.url)).toEqual([urls.billing, urls.pricing]);
    expect(us.neutralText).toBeNull();
  });

  it('shows read-only neutral text and no links outside the US', () => {
    const other = planManageLinks(false, urls);
    expect(other.links).toEqual([]);
    expect(other.neutralText).toBe(PLAN_NEUTRAL_TEXT);
    expect(PLAN_NEUTRAL_TEXT).not.toMatch(/https?:|scholarmancy\.com/i);
  });
});

describe('planLabel / formatPlanDate', () => {
  it('labels every plan', () => {
    expect(planLabel('free')).toBe('Free');
    expect(planLabel('starter')).toBe('Starter');
    expect(planLabel('premium')).toBe('Premium');
    expect(planLabel('family')).toBe('Family');
    expect(planLabel('enterprise')).toBe('Enterprise');
  });

  it('formats dates in UTC without locale APIs', () => {
    expect(formatPlanDate(new Date('2026-12-01T00:00:00.000Z'))).toBe('Dec 1, 2026');
  });
});

describe('studentsSummary', () => {
  it('reports used of allowed and the limit flag', () => {
    expect(studentsSummary(1, 2)).toEqual({ text: '1 of 2 students', atLimit: false });
    expect(studentsSummary(1, 1)).toEqual({ text: '1 of 1 student', atLimit: true });
  });

  it('has no limit when unlimited or unreported', () => {
    expect(studentsSummary(7, null)).toEqual({ text: '7 students', atLimit: false });
    expect(studentsSummary(1, null).text).toBe('1 student');
  });
});

describe('buildPlanViewModel', () => {
  it('shows the free plan', () => {
    const v = vm(sub({ plan: 'free', effectivePlan: 'free', maxStudents: 1 }), 1);
    expect(v.planLabel).toBe('Free');
    expect(v.statusText).toBe('Free plan');
    expect(v.studentsText).toBe('1 of 1 student');
    expect(v.atLimit).toBe(true);
    expect(v.tone).toBe('ok');
    expect(v.daysLeft).toBeNull();
  });

  it('shows an active plan with its renewal date', () => {
    const v = vm(sub({ currentPeriodEnd: '2026-12-01T00:00:00.000Z' }), 1);
    expect(v.statusText).toBe('Active, renews Dec 1, 2026');
    expect(v.studentsText).toBe('1 of 2 students');
    expect(v.atLimit).toBe(false);
  });

  it('active without a period end still renders', () => {
    expect(vm(sub({})).statusText).toBe('Active');
  });

  it('counts the days left in a trial', () => {
    const v = vm(sub({ status: 'trialing', trialEnd: '2026-11-18T12:00:00.000Z' }));
    expect(v.statusText).toBe('Free trial of Premium');
    expect(v.daysLeft).toBe(10);
    expect(v.daysLeftText).toBe('10 days left in your trial (ends Nov 18, 2026)');
    expect(v.tone).toBe('ok');
  });

  it('warns when the trial is about to end', () => {
    const v = vm(sub({ status: 'trialing', trialEnd: '2026-11-09T00:00:00.000Z' }));
    expect(v.daysLeft).toBe(1);
    expect(v.daysLeftText).toContain('1 day left');
    expect(v.tone).toBe('warn');
  });

  it('reports an ended trial', () => {
    const v = vm(
      sub({
        status: 'trialing',
        trialEnd: '2026-11-01T00:00:00.000Z',
        effectivePlan: 'free',
        maxStudents: 1,
      })
    );
    expect(v.statusText).toBe('Trial ended');
    expect(v.tone).toBe('bad');
    expect(v.studentsText).toBe('1 of 1 student');
    expect(showsEffectivePlanNote(v)).toBe(true);
  });

  it('counts the grace days of a past-due plan', () => {
    const v = vm(sub({ status: 'past_due', currentPeriodEnd: '2026-11-05T12:00:00.000Z' }));
    expect(v.statusText).toBe('Payment past due');
    expect(v.daysLeft).toBe(4);
    expect(v.daysLeftText).toBe('4 days left before Premium features pause');
    expect(v.tone).toBe('warn');
  });

  it('says less than a day when the grace window is almost over', () => {
    const v = vm(sub({ status: 'past_due', currentPeriodEnd: '2026-11-01T18:00:00.000Z' }));
    expect(v.daysLeft).toBe(1);
    const lessThanDay = buildPlanViewModel({
      subscription: sub({ status: 'past_due', currentPeriodEnd: '2026-11-01T12:00:00.000Z' }),
      studentCount: 1,
      now: new Date('2026-11-08T11:59:59.000Z'),
    });
    expect(lessThanDay.daysLeftText).toBe('1 day left before Premium features pause');
    const zero = buildPlanViewModel({
      subscription: sub({ status: 'past_due', currentPeriodEnd: '2026-11-01T12:00:00.000Z' }),
      studentCount: 1,
      now: new Date('2026-11-08T12:00:00.000Z'),
    });
    expect(zero.statusText).toBe('Payment past due, plan lapsed');
  });

  it('reports a lapsed past-due plan', () => {
    const v = vm(
      sub({
        status: 'past_due',
        currentPeriodEnd: '2026-10-01T00:00:00.000Z',
        effectivePlan: 'free',
        maxStudents: 1,
      })
    );
    expect(v.statusText).toBe('Payment past due, plan lapsed');
    expect(v.tone).toBe('bad');
    expect(v.daysLeft).toBeNull();
  });

  it('past due without a period end has no countdown', () => {
    const v = vm(sub({ status: 'past_due' }));
    expect(v.statusText).toBe('Payment past due');
    expect(v.daysLeftText).toBeNull();
  });

  it('shows cancel-at-period-end with days left', () => {
    const v = vm(sub({ cancelAtPeriodEnd: true, currentPeriodEnd: '2026-11-28T12:00:00.000Z' }));
    expect(v.statusText).toBe('Cancels on Nov 28, 2026');
    expect(v.daysLeft).toBe(20);
    expect(v.tone).toBe('warn');
  });

  it('cancel-at-period-end without a date still renders', () => {
    expect(vm(sub({ cancelAtPeriodEnd: true })).statusText).toBe(
      'Cancels at the end of the period'
    );
  });

  it('shows cancelled, expired and paused', () => {
    const cancelled = vm(sub({ status: 'cancelled', effectivePlan: 'free', maxStudents: 1 }));
    expect(cancelled.statusText).toBe('Cancelled');
    expect(cancelled.tone).toBe('bad');
    expect(vm(sub({ status: 'expired' })).statusText).toBe('Expired');
    const paused = vm(sub({ status: 'paused' }));
    expect(paused.statusText).toBe('Paused');
    expect(paused.tone).toBe('warn');
  });

  it('warns when the effective plan is lower than the purchased plan', () => {
    const v = vm(sub({ effectivePlan: 'free', maxStudents: 1 }));
    expect(v.tone).toBe('warn');
    expect(v.effectivePlanLabel).toBe('Free');
    expect(showsEffectivePlanNote(v)).toBe(true);
  });

  it('does not invent a limit when the server omits maxStudents or says unlimited', () => {
    const noLimit = vm(sub({ maxStudents: undefined }), 3);
    expect(noLimit.studentsAllowed).toBeNull();
    expect(noLimit.studentsText).toBe('3 students');
    const unlimited = vm(
      sub({ plan: 'enterprise', effectivePlan: 'enterprise', maxStudents: -1 }),
      9
    );
    expect(unlimited.studentsAllowed).toBeNull();
    expect(unlimited.atLimit).toBe(false);
  });

  it('ignores unparseable dates', () => {
    const v = vm(sub({ currentPeriodEnd: 'not-a-date', status: 'past_due' }));
    expect(v.daysLeftText).toBeNull();
    expect(vm(sub({ currentPeriodEnd: '' })).statusText).toBe('Active');
  });
});
