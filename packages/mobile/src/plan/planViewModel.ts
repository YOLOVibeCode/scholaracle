/**
 * Pure view-model for the Plan & usage screen. No React, no network.
 *
 * The phone shows plan information read-only: the app has no in-app purchase,
 * and the "manage on the web" link is offered only where the store allows it
 * (iOS on a US-locale device; see canLinkToWebPlans in usStorefrontLocale.ts),
 * never as steering anywhere else.
 */

import type { ISubscriptionWire, SubscriptionPlanWire } from '@scholaracle/contracts';

/** Mirrors PAID_PLAN_GRACE_DAYS in packages/database (Subscription model). */
export const PAID_PLAN_GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

const PLAN_LABELS: Readonly<Record<SubscriptionPlanWire, string>> = {
  free: 'Free',
  starter: 'Starter',
  premium: 'Premium',
  family: 'Family',
  enterprise: 'Enterprise',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type PlanTone = 'ok' | 'warn' | 'bad';

export interface IPlanViewModel {
  readonly planLabel: string;
  /** Plan whose limits apply right now (differs from planLabel once lapsed). */
  readonly effectivePlanLabel: string;
  readonly statusText: string;
  readonly tone: PlanTone;
  /** Whole days left in the trial or the post-period grace window; null when neither applies. */
  readonly daysLeft: number | null;
  readonly daysLeftText: string | null;
  readonly studentsUsed: number;
  /** null = unlimited or not reported by the server. */
  readonly studentsAllowed: number | null;
  readonly studentsText: string;
  readonly atLimit: boolean;
}

export interface IPlanViewModelInput {
  readonly subscription: ISubscriptionWire;
  readonly studentCount: number;
  readonly now: Date;
}

export function planLabel(plan: SubscriptionPlanWire): string {
  return PLAN_LABELS[plan] ?? 'Free';
}

function parseDate(raw: string | undefined): Date | null {
  if (raw === undefined || raw === '') return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Deterministic "Oct 28, 2026" (UTC) — no locale/ICU dependence on Hermes. */
export function formatPlanDate(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function wholeDaysUntil(end: Date, now: Date): number {
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
}

function daysPhrase(days: number): string {
  if (days === 0) return 'less than a day';
  return days === 1 ? '1 day' : `${days} days`;
}

export function studentsSummary(
  used: number,
  allowed: number | null
): { readonly text: string; readonly atLimit: boolean } {
  const noun = (n: number): string => (n === 1 ? 'student' : 'students');
  if (allowed === null) return { text: `${used} ${noun(used)}`, atLimit: false };
  return {
    text: `${used} of ${allowed} ${noun(allowed)}`,
    atLimit: used >= allowed,
  };
}

export function buildPlanViewModel(input: IPlanViewModelInput): IPlanViewModel {
  const { subscription: sub, studentCount, now } = input;
  const label = planLabel(sub.plan);
  const effectiveLabel = planLabel(sub.effectivePlan);
  const periodEnd = parseDate(sub.currentPeriodEnd);
  const trialEnd = parseDate(sub.trialEnd);

  const allowed =
    typeof sub.maxStudents === 'number' && sub.maxStudents >= 0 ? sub.maxStudents : null;
  const students = studentsSummary(studentCount, allowed);

  let statusText: string;
  let tone: PlanTone = 'ok';
  let daysLeft: number | null = null;
  let daysLeftText: string | null = null;

  if (sub.plan === 'free') {
    statusText = 'Free plan';
  } else if (sub.status === 'trialing') {
    if (trialEnd && trialEnd.getTime() > now.getTime()) {
      daysLeft = wholeDaysUntil(trialEnd, now);
      statusText = `Free trial of ${label}`;
      daysLeftText = `${daysPhrase(daysLeft)} left in your trial (ends ${formatPlanDate(trialEnd)})`;
      tone = daysLeft <= 3 ? 'warn' : 'ok';
    } else {
      statusText = 'Trial ended';
      tone = 'bad';
    }
  } else if (sub.status === 'past_due') {
    statusText = 'Payment past due';
    tone = 'warn';
    if (periodEnd) {
      const graceEnd = new Date(periodEnd.getTime() + PAID_PLAN_GRACE_DAYS * DAY_MS);
      if (graceEnd.getTime() > now.getTime()) {
        daysLeft = wholeDaysUntil(graceEnd, now);
        daysLeftText = `${daysPhrase(daysLeft)} left before ${label} features pause`;
      } else {
        statusText = 'Payment past due, plan lapsed';
        tone = 'bad';
      }
    }
  } else if (sub.status === 'cancelled' || sub.status === 'expired') {
    statusText = sub.status === 'cancelled' ? 'Cancelled' : 'Expired';
    tone = 'bad';
  } else if (sub.status === 'paused') {
    statusText = 'Paused';
    tone = 'warn';
  } else if (sub.cancelAtPeriodEnd === true) {
    tone = 'warn';
    if (periodEnd) {
      daysLeft = wholeDaysUntil(periodEnd, now);
      statusText = `Cancels on ${formatPlanDate(periodEnd)}`;
      daysLeftText = `${daysPhrase(daysLeft)} left on your plan`;
    } else {
      statusText = 'Cancels at the end of the period';
    }
  } else {
    statusText = periodEnd ? `Active, renews ${formatPlanDate(periodEnd)}` : 'Active';
  }

  if (sub.effectivePlan !== sub.plan && tone === 'ok') tone = 'warn';

  return {
    planLabel: label,
    effectivePlanLabel: effectiveLabel,
    statusText,
    tone,
    daysLeft,
    daysLeftText,
    studentsUsed: studentCount,
    studentsAllowed: allowed,
    studentsText: students.text,
    atLimit: students.atLimit,
  };
}

/** True when the screen must also say which limits apply (plan differs from what was bought). */
export function showsEffectivePlanNote(vm: IPlanViewModel): boolean {
  return vm.effectivePlanLabel !== vm.planLabel;
}

/** Shown in place of the web links wherever they are not allowed (same wording as onboarding). */
export const PLAN_NEUTRAL_TEXT =
  'Membership is managed on the web — not in this app. This screen is read-only.';

export interface IPlanManageLink {
  readonly label: string;
  readonly url: string;
  readonly testID: string;
}

export interface IPlanManageLinks {
  /** Outbound links; empty unless canLinkToWebPlans allowed them (iOS, US locale). */
  readonly links: readonly IPlanManageLink[];
  readonly neutralText: string | null;
}

export function planManageLinks(
  canLinkOut: boolean,
  urls: { readonly pricing: string; readonly billing: string }
): IPlanManageLinks {
  if (!canLinkOut) return { links: [], neutralText: PLAN_NEUTRAL_TEXT };
  return {
    links: [
      {
        label: 'Manage plan on scholarmancy.com',
        url: urls.billing,
        testID: 'link-manage-plan-scholarmancy',
      },
      {
        label: 'See plans on scholarmancy.com',
        url: urls.pricing,
        testID: 'link-see-plans-scholarmancy',
      },
    ],
    neutralText: null,
  };
}
