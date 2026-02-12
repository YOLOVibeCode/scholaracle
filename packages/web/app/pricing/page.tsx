'use client';

import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Get started with basic monitoring',
    features: [
      '1 student',
      'Basic alerts',
      'Email notifications',
      '7-day history',
    ],
    priceId: null,
    popular: false,
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '$19',
    period: '/month',
    description: 'For parents with one student',
    features: [
      '1 student',
      'All alert types',
      'Email + push notifications',
      'LMS integration',
      '30-day history',
      'AI-powered recommendations',
    ],
    priceId: 'price_starter',
    popular: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '$39',
    period: '/month',
    description: 'For families with multiple students',
    features: [
      'Up to 5 students',
      'All alert types',
      'All notification channels',
      'LMS integration',
      'Unlimited history',
      'AI-powered recommendations',
      'Priority support',
    ],
    priceId: 'price_premium',
    popular: false,
  },
] as const;

export default function PricingPage() {
  const router = useRouter();

  const handleSelectPlan = (priceId: string | null) => {
    if (!priceId) {
      router.push('/register');
      return;
    }
    // Redirect to dashboard billing with the selected plan
    router.push(`/dashboard/billing?upgrade=${priceId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950" data-testid="pricing-page">
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">Simple, transparent pricing</h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
            Choose the plan that fits your family
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
                  onClick={() => handleSelectPlan(plan.priceId)}
                  data-testid={`select-${plan.id}`}
                >
                  {plan.priceId ? 'Get Started' : 'Sign Up Free'}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
