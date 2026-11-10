'use client';

import { useMemo, useState, type ReactElement } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ITrialCountdownBannerProps {
  readonly trialEndIso: string;
}

function daysUntil(isoEnd: string): number | null {
  const end = new Date(isoEnd);
  if (Number.isNaN(end.getTime())) {
    return null;
  }
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  const diffMs = endDay.getTime() - startOfToday.getTime();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

export function TrialCountdownBanner({ trialEndIso }: ITrialCountdownBannerProps): ReactElement | null {
  const [dismissed, setDismissed] = useState(false);
  const daysLeft = useMemo(() => daysUntil(trialEndIso), [trialEndIso]);

  if (dismissed || daysLeft === null || daysLeft < 0) {
    return null;
  }

  const dayWord = daysLeft === 1 ? 'day' : 'days';
  const message =
    daysLeft === 0
      ? 'Your free trial ends today. Upgrade to keep full access.'
      : `Your free trial ends in ${daysLeft} ${dayWord}. Upgrade to keep full access.`;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="trial-countdown-banner"
      className="flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <p>{message}</p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        aria-label="Dismiss trial reminder"
        data-testid="button-dismiss-trial-banner"
        onClick={() => setDismissed(true)}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
