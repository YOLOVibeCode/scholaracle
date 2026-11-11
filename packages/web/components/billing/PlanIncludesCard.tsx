import { Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ISubscriptionInfo } from '@/lib/api/billing';

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  premium: 'Premium',
  family: 'Family',
  enterprise: 'Enterprise',
};

export interface PlanIncludesCardProps {
  readonly subscription: ISubscriptionInfo | null;
}

export function PlanIncludesCard({ subscription }: PlanIncludesCardProps) {
  const effectivePlan = subscription?.effectivePlan ?? subscription?.plan ?? 'free';
  const lines =
    subscription?.featureLines ??
    (effectivePlan === 'free' ? ['1 student', 'Email alerts', '7-day history'] : []);

  if (lines.length === 0) {
    return null;
  }

  return (
    <Card data-testid="plan-includes-card">
      <CardHeader>
        <CardTitle className="text-base">Plan includes</CardTitle>
        <CardDescription>
          Benefits and limits for your {PLAN_LABELS[effectivePlan] ?? effectivePlan} plan
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2" data-testid="plan-feature-lines">
          {lines.map((line) => (
            <li key={line} className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500 shrink-0" />
              {line}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
