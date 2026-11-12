export type BillingCycle = 'monthly' | 'annual';

export const PURCHASABLE_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 9.99,
    annualPrice: 99.99,
    students: 1,
    description: 'One student — just $9.99/month',
    features: ['1 student', 'Email + SMS alerts', 'LMS integration', '30-day history'] as const,
    plan: 'starter' as const,
    popular: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    monthlyPrice: 19.99,
    annualPrice: 199.99,
    students: 2,
    description: 'Two students — $9.99 each',
    features: [
      '2 students',
      'All notification channels',
      'Advanced analytics',
      'Priority support',
      'Unlimited history',
    ] as const,
    plan: 'premium' as const,
    popular: false,
  },
  {
    id: 'family',
    name: 'Family',
    monthlyPrice: 49.99,
    annualPrice: 499.99,
    students: 5,
    description: 'Five students — $9.99 each',
    features: [
      '5 students',
      'All notification channels',
      'Advanced analytics',
      'Priority support',
      'Unlimited history',
    ] as const,
    plan: 'family' as const,
    popular: false,
  },
] as const;

export const PRICING_PAGE_PLANS = [
  {
    id: 'free',
    name: 'Free',
    monthlyPrice: 0,
    annualPrice: 0,
    students: 1,
    description: 'Get started with basic monitoring',
    features: ['1 student', 'Email alerts', '7-day history'] as const,
    plan: null as string | null,
    popular: false,
  },
  ...PURCHASABLE_PLANS,
] as const;
