'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PURCHASABLE_PLANS, type BillingCycle } from '@/lib/billing/planCatalog';

export type PlanPickerMode = 'checkout' | 'switch';

export interface UpgradePlanPickerProps {
  readonly mode?: PlanPickerMode;
  readonly initialPlan?: string | null;
  readonly initialCycle: BillingCycle;
  readonly currentPlan?: string | null;
  readonly currentCycle?: BillingCycle;
  readonly switchDisabled?: boolean;
  readonly onCheckout: (plan: string, cycle: BillingCycle) => void;
  readonly onSwitchRequest?: (plan: string, cycle: BillingCycle) => void;
}

export function UpgradePlanPicker({
  mode = 'checkout',
  initialPlan,
  initialCycle,
  currentPlan,
  currentCycle = 'monthly',
  switchDisabled = false,
  onCheckout,
  onSwitchRequest,
}: UpgradePlanPickerProps) {
  const validInitial =
    initialPlan && PURCHASABLE_PLANS.some((p) => p.plan === initialPlan) ? initialPlan : 'starter';
  const [selectedPlan, setSelectedPlan] = useState(validInitial);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(initialCycle);

  const isCurrentSelection = (plan: string, cycle: BillingCycle): boolean =>
    mode === 'switch' &&
    currentPlan === plan &&
    (currentCycle ?? 'monthly') === cycle;

  const handlePrimaryAction = () => {
    if (mode === 'switch') {
      onSwitchRequest?.(selectedPlan, billingCycle);
      return;
    }
    onCheckout(selectedPlan, billingCycle);
  };

  const primaryDisabled =
    switchDisabled ||
    (mode === 'switch' && isCurrentSelection(selectedPlan, billingCycle));

  return (
    <Card data-testid="upgrade-plan-picker">
      <CardHeader>
        <CardTitle className="text-base">
          {mode === 'switch' ? 'Change your plan' : 'Choose a plan'}
        </CardTitle>
        <CardDescription>
          {mode === 'switch'
            ? 'Pick a new tier or billing cycle for your subscription'
            : 'Select a subscription tier and billing cycle'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === 'switch' && switchDisabled && (
          <p
            className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
            data-testid="billing-plan-switch-disabled-notice"
          >
            Plan changes are unavailable while your subscription is set to cancel at period end.
          </p>
        )}
        <div className="flex items-center gap-2" data-testid="billing-cycle-toggle">
          <span className={billingCycle === 'monthly' ? 'font-medium text-sm' : 'text-muted-foreground text-sm'}>
            Monthly
          </span>
          <button
            type="button"
            role="switch"
            aria-label="Bill annually"
            aria-checked={billingCycle === 'annual'}
            onClick={() => setBillingCycle((c) => (c === 'monthly' ? 'annual' : 'monthly'))}
            disabled={switchDisabled}
            className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 aria-[checked=true]:bg-blue-600"
            data-testid="toggle-annual-billing"
          >
            <span
              className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform"
              style={{
                transform: billingCycle === 'annual' ? 'translateX(1.25rem)' : 'translateX(0)',
              }}
            />
          </button>
          <span
            className={
              billingCycle === 'annual' ? 'font-medium text-sm' : 'text-muted-foreground text-sm'
            }
          >
            Annual
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-3" data-testid="billing-plan-options">
          {PURCHASABLE_PLANS.map((plan) => {
            const isSelected = selectedPlan === plan.plan;
            const price = billingCycle === 'annual' ? plan.annualPrice : plan.monthlyPrice;
            const period = billingCycle === 'annual' ? '/year' : '/month';
            const isCurrent =
              mode === 'switch' && currentPlan === plan.plan && (currentCycle ?? 'monthly') === billingCycle;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlan(plan.plan)}
                disabled={switchDisabled}
                className={`rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  isSelected ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30' : 'border-border'
                }`}
                data-testid={`plan-option-${plan.id}`}
                aria-pressed={isSelected}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{plan.name}</span>
                  {isCurrent ? (
                    <Badge variant="outline" data-testid={`badge-current-plan-${plan.id}`}>
                      Current plan
                    </Badge>
                  ) : (
                    plan.popular && <Badge variant="secondary">Popular</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                <p className="mt-2 text-lg font-bold">
                  ${price}
                  <span className="text-sm font-normal text-muted-foreground">{period}</span>
                </p>
                <ul className="mt-2 space-y-1">
                  {plan.features.slice(0, 3).map((f) => (
                    <li key={f} className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Check className="h-3 w-3 text-green-500" />
                      {f}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      </CardContent>
      <CardFooter>
        <Button
          onClick={handlePrimaryAction}
          disabled={primaryDisabled}
          data-testid={mode === 'switch' ? 'button-request-plan-switch' : 'button-upgrade-selected-plan'}
        >
          {mode === 'switch' ? 'Review plan switch' : 'Continue to checkout'}
        </Button>
      </CardFooter>
    </Card>
  );
}
