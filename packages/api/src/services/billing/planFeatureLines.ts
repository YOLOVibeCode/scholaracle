import { PLAN_FEATURES, type SubscriptionPlan } from '@scholaracle/database';

export interface IPlanFeaturesPayload {
  readonly maxStudents: number;
  readonly emailNotifications: boolean;
  readonly smsNotifications: boolean;
  readonly prioritySupport: boolean;
  readonly advancedAnalytics: boolean;
}

function studentLine(maxStudents: number): string {
  if (maxStudents < 0) {
    return 'Unlimited students';
  }
  if (maxStudents === 1) {
    return '1 student';
  }
  return `${maxStudents} students`;
}

/**
 * Human-readable feature bullets for billing UI (aligned with pricing page copy).
 */
export function planFeaturesForApi(plan: SubscriptionPlan): IPlanFeaturesPayload {
  return PLAN_FEATURES[plan];
}

export function planFeatureLines(plan: SubscriptionPlan): readonly string[] {
  const f = PLAN_FEATURES[plan];
  const lines: string[] = [studentLine(f.maxStudents)];

  switch (plan) {
    case 'free':
      lines.push('Email alerts', '7-day history');
      break;
    case 'starter':
      lines.push('Email + SMS alerts', 'LMS integration', '30-day history');
      break;
    case 'premium':
      lines.push(
        'All notification channels',
        'Advanced analytics',
        'Priority support',
        'Unlimited history'
      );
      break;
    case 'family':
      lines.push(
        'All notification channels',
        'Advanced analytics',
        'Priority support',
        'Unlimited history'
      );
      break;
    case 'enterprise':
      lines.push(
        'All notification channels',
        'Advanced analytics',
        'Priority support',
        'Unlimited history'
      );
      break;
    default:
      if (f.emailNotifications) {
        lines.push('Email alerts');
      }
      if (f.smsNotifications) {
        lines.push('SMS alerts');
      }
      break;
  }

  return lines;
}
