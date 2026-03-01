'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { billingApi } from '@/lib/api/billing';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Get started with basic monitoring',
    features: [
      '1 student',
      'Email alerts',
      '7-day history',
    ],
    plan: null as string | null,
    popular: false,
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '$9',
    period: '/month',
    annualPrice: '$90/yr',
    description: 'For parents tracking one student',
    features: [
      '2 students',
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
    price: '$19',
    period: '/month',
    annualPrice: '$190/yr',
    description: 'For families with multiple students',
    features: [
      '5 students',
      'All notification channels',
      'Advanced analytics',
      'Priority support',
      'Unlimited history',
    ],
    plan: 'premium',
    popular: false,
  },
] as const;

export default function PricingPage() {
  const router = useRouter();
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
    const couponParam = couponResult?.valid && couponCode ? `&coupon=${couponCode}` : '';
    router.push(`/dashboard/billing?upgrade=${plan}${couponParam}`);
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
            Choose the plan that fits your family. Start free, upgrade when you need more.
          </p>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-3" data-testid="plan-cards">
          {PLANS.map((plan) => (
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
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-gray-500">{plan.period}</span>
                  {'annualPrice' in plan && plan.annualPrice && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      or {plan.annualPrice} (save ~17%)
                    </span>
                  )}
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
          ))}
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
