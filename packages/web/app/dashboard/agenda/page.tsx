'use client';

import { useMemo, useState } from 'react';
import { agendaApi, type IAgendaItem, type IAgendaResponse } from '@/lib/api/agenda';
import { Button } from '@/components/ui/button';
import { useAsyncData } from '@/lib/hooks';
import { ErrorDisplay, LoadingSkeleton } from '@/components/common';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function AgendaPage() {
  const range = useMemo(() => {
    const from = startOfDay(new Date());
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60_000);
    return { from, to };
  }, []);

  const { data: agendaResponse, isLoading: loading, error, retry, refresh } = useAsyncData<IAgendaResponse>(
    async () => {
      const res = await agendaApi.getRange(range.from.toISOString(), range.to.toISOString());
      if (!res.success || !res.data) {
        throw new Error(res.error ?? 'Failed to load agenda');
      }
      return res.data;
    },
    { retryCount: 2, retryDelay: 1000 }
  );

  const items = agendaResponse?.items ?? [];
  const hasItems = items.length > 0;

  const handleSnooze = async (id: string) => {
    // id is `${type}:${itemKey}`
    const [type, ...rest] = id.split(':');
    const itemType = (type as 'assignment' | 'event_occurrence') ?? 'assignment';
    const itemKey = rest.join(':');
    const snoozedUntil = new Date(Date.now() + 24 * 60 * 60_000).toISOString();

    try {
      await agendaApi.snooze({ itemType, itemKey, snoozedUntil, scope: 'occurrence' });
      refresh(); // Refresh the agenda after snoozing
    } catch (err) {
      // Error handling is done by the hook
      console.error('Failed to snooze item:', err);
    }
  };

  return (
    <div className="space-y-4" data-testid="agenda-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agenda</h1>
        <p className="text-gray-600 dark:text-gray-400">Next 7 days across all children and schools.</p>
      </div>

      {/* Show a full loading skeleton only on initial load (no data yet). Keep stale data visible during refresh for better UX/stability. */}
      {loading && !hasItems && (
        <div data-testid="agenda-loading">
          <LoadingSkeleton variant="list" count={5} />
        </div>
      )}
      {error && !hasItems && (
        <ErrorDisplay error={error} title="Failed to load agenda" onRetry={retry} data-testid="agenda-error" />
      )}

      {/* If we have existing items, keep them visible even if loading or error occurs. */}
      {(hasItems || (!loading && !error)) && (
        <div className="space-y-2" data-testid="agenda-list">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200" data-testid="agenda-error-inline">
              Failed to refresh agenda: {error}
            </div>
          )}
          {items.length === 0 ? (
            <div className="text-sm text-gray-600" data-testid="agenda-empty">
              No upcoming items.
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-md border p-3"
                data-testid="agenda-item"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{item.title}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {item.courseName && (
                      <span className="font-medium text-gray-700 dark:text-gray-300">{item.courseName}</span>
                    )}
                    {item.courseName && ' • '}
                    {new Date(item.timeAt).toLocaleString()}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSnooze(item.id)}
                  data-testid="agenda-snooze"
                  className="ml-4"
                >
                  Snooze 1d
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}


