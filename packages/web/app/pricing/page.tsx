'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { billingApi } from '@/lib/api/billing';

type BillingCycle = 'monthly' | 'annual';

const PLANS: readonly {
  id: string;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  students: number;
  description: string;
  features: readonly string[];
  plan: string | null;
  popular: boolean;
}[] = [
  {
    id: 'free',
    name: 'Free',
    monthlyPrice: 0,
    annualPrice: 0,
    students: 1,
    description: 'Get started with basic monitoring',
    features: ['1 student', 'Email alerts', '7-day history'],
    plan: null,
    popular: false,
  },
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 9.99,
    annualPrice: 99.99,
    students: 1,
    description: 'One student — just $9.99/month',
    features: [
      '1 student',
      'Email + SMS alerts',
      'LMS integration',
      '30-day history',
    ],
    plan: 'starter',
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
    ],
    plan: 'premium',
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
    ],
    plan: 'family',
    popular: false,
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [couponCode, setCouponCode] = useState('');
  const [couponResult, setCouponResult] = useState<{
    valid: boolean;
    discountLabel?: string;
    error?: string;
  } | null>(null);
  const [validating, setValidating] = useState(false);

  const handleSelectPlan = (plan: string | null) => {
    if (!plan) {
      router.push('/register');
      return;
    }
    const couponParam = couponResult?.valid && couponCode ? `&coupon=${encodeURIComponent(couponCode)}` : '';
    router.push(`/dashboard/billing?upgrade=${plan}&cycle=${billingCycle}${couponParam}`);
  };

  const handleValidateCoupon = async () => {
    if (!couponCode.trim()) return;
    setValidating(true);
    setCouponResult(null);
    try {
      const res = await billingApi.validateCoupon(couponCode.trim());
      if (res.valid && res.coupon) {
        setCouponResult({ valid: true, discountLabel: res.coupon.discountLabel });
      } else {
        setCouponResult({ valid: false, error: res.error ?? 'Invalid coupon' });
      }
    } catch {
      setCouponResult({ valid: false, error: 'Failed to validate coupon' });
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950" data-testid="pricing-page">
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">Simple, transparent pricing</h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
            $9.99 per student per month. One dashboard, one bill — the primary account holder pays.
          </p>
        </div>

        <div className="mx-auto mt-8 flex items-center justify-center gap-3" data-testid="billing-cycle-toggle">
          <span className={billingCycle === 'monthly' ? 'font-medium' : 'text-muted-foreground'}>
            Monthly
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={billingCycle === 'annual'}
            onClick={() => setBillingCycle((c) => (c === 'monthly' ? 'annual' : 'monthly'))}
            className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-gray-700 aria-checked:bg-blue-600"
            data-testid="toggle-annual"
          >
            <span
              className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform aria-checked:translate-x-5"
              style={{ transform: billingCycle === 'annual' ? 'translateX(1.25rem)' : 'translateX(0)' }}
            />
          </button>
          <span className={billingCycle === 'annual' ? 'font-medium' : 'text-muted-foreground'}>
            Annual <span className="text-xs text-green-600 dark:text-green-400">(save ~17%)</span>
          </span>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4" data-testid="plan-cards">
          {PLANS.map((plan) => {
            const isAnnual = billingCycle === 'annual';
            const price =
              plan.plan === null
                ? 0
                : isAnnual
                  ? plan.annualPrice
                  : plan.monthlyPrice;
            const period =
              plan.plan === null
                ? 'forever'
                : isAnnual
                  ? '/year'
                  : '/month';
            return (
            <Card
              key={plan.id}
              className={plan.popular ? 'border-2 border-blue-500 dark:border-blue-400' : ''}
              data-testid={`plan-card-${plan.id}`}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{plan.name}</CardTitle>
                  {plan.popular && <Badge>Popular</Badge>}
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <span className="text-4xl font-bold">
                    {plan.plan === null ? '$0' : `$${price}`}
                  </span>
                  <span className="text-gray-500">{period}</span>
                </div>
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={plan.popular ? 'default' : 'outline'}
                  onClick={() => handleSelectPlan(plan.plan)}
                  data-testid={`select-${plan.id}`}
                >
                  {plan.plan ? 'Get Started' : 'Sign Up Free'}
                </Button>
              </CardFooter>
            </Card>
          );
          })}
        </div>

        <div className="mx-auto mt-10 max-w-sm text-center" data-testid="coupon-section">
          <p className="mb-2 text-sm text-muted-foreground">Have a coupon code?</p>
          <div className="flex gap-2">
            <Input
              data-testid="input-coupon-code"
              placeholder="Enter coupon code"
              value={couponCode}
              onChange={(e) => {
                setCouponCode(e.target.value.toUpperCase());
                setCouponResult(null);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleValidateCoupon(); }}
            />
            <Button
              variant="outline"
              onClick={() => void handleValidateCoupon()}
              disabled={validating || !couponCode.trim()}
              data-testid="button-apply-coupon"
            >
              {validating ? 'Checking...' : 'Apply'}
            </Button>
          </div>
          {couponResult && (
            <p
              className={`mt-2 text-sm ${couponResult.valid ? 'text-green-600' : 'text-red-600'}`}
              data-testid="coupon-result"
            >
              {couponResult.valid
                ? `Coupon applied: ${couponResult.discountLabel}`
                : couponResult.error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
