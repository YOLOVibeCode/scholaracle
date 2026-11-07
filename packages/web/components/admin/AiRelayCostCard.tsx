'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { adminAiApi, type IAdminAiUsageSummary } from '@/lib/api/admin/ai';

function formatUsd(value: number): string {
  return value < 0.01 ? `$${value.toFixed(6)}` : `$${value.toFixed(4)}`;
}

export function AiRelayCostCard() {
  const [summary, setSummary] = useState<IAdminAiUsageSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const res = await adminAiApi.getUsageSummary();
        if (res.success && res.data) {
          setSummary(res.data);
        } else {
          setLoadError('Failed to load AI usage');
        }
      } catch (err: unknown) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load AI usage');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const passPercent =
    summary !== null ? `${Math.round(summary.verificationPassRate * 1000) / 10}%` : '—';

  return (
    <Card data-testid="card-ai-relay-cost">
      <CardHeader>
        <CardTitle className="text-base font-medium">AI relay spend (MTD)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3" data-loading={isLoading}>
        {isLoading ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading…</p>
        ) : loadError !== null ? (
          <p className="text-sm text-red-600 dark:text-red-400" data-testid="error-ai-relay-cost">
            {loadError}
          </p>
        ) : summary !== null ? (
          <>
            <div>
              <div className="text-2xl font-bold" data-testid="ai-relay-mtd-spend">
                {formatUsd(summary.monthToDateSpendUsd)}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">Month-to-date from ai_usage</p>
            </div>
            <div className="flex justify-between text-sm">
              <span>Repair verification pass rate</span>
              <span data-testid="ai-relay-pass-rate">{passPercent}</span>
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Repairs by district (MTD)</p>
              {summary.repairsByDistrict.length === 0 ? (
                <p className="text-xs text-gray-600 dark:text-gray-400" data-testid="ai-relay-districts-empty">
                  None yet
                </p>
              ) : (
                <ul className="text-sm space-y-1" data-testid="ai-relay-districts">
                  {summary.repairsByDistrict.map((row) => (
                    <li
                      key={row.portalHost}
                      className="flex justify-between"
                      data-testid={`ai-relay-district-${row.portalHost}`}
                    >
                      <span className="truncate pr-2">{row.portalHost}</span>
                      <span>{row.repairCount}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
