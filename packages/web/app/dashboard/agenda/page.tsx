'use client';

import { useMemo, useState, useCallback } from 'react';
import { agendaApi, type IAgendaItem, type IAgendaResponse } from '@/lib/api/agenda';
import { useAsyncData } from '@/lib/hooks';
import { ErrorDisplay, LoadingSkeleton } from '@/components/common';
import {
  AgendaDateGroup,
  AgendaFilterBar,
  groupItemsByDate,
  filterItems,
} from '@/components/dashboard/agenda';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function AgendaPage() {
  const range = useMemo(() => {
    const from = startOfDay(new Date());
    const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
    return { from, to };
  }, []);

  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());

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

  const rawItems = agendaResponse?.items ?? [];
  const filteredItems = useMemo(
    () => filterItems(rawItems, selectedLabels, selectedStudents),
    [rawItems, selectedLabels, selectedStudents]
  );
  const grouped = useMemo(() => groupItemsByDate(filteredItems), [filteredItems]);
  const hasItems = rawItems.length > 0;

  const handleSnooze = useCallback(
    async (id: string) => {
      const [type, ...rest] = id.split(':');
      const itemType = (type as 'assignment' | 'event_occurrence') ?? 'assignment';
      const itemKey = rest.join(':');
      const snoozedUntil = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
      try {
        await agendaApi.snooze({ itemType, itemKey, snoozedUntil, scope: 'occurrence' });
        refresh();
      } catch {
        // Error handling is done by the hook
      }
    },
    [refresh]
  );

  const handleToggleLabel = useCallback((label: string) => {
    setSelectedLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  const handleToggleStudent = useCallback((student: string) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(student)) next.delete(student);
      else next.add(student);
      return next;
    });
  }, []);

  const handleClearFilters = useCallback(() => {
    setSelectedLabels(new Set());
    setSelectedStudents(new Set());
  }, []);

  return (
    <div className="space-y-4" data-testid="agenda-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agenda</h1>
        <p className="text-muted-foreground">
          Next 14 days across all children and schools.
        </p>
      </div>

      {loading && !hasItems && (
        <div data-testid="agenda-loading">
          <LoadingSkeleton variant="list" count={5} />
        </div>
      )}
      {error && !hasItems && (
        <ErrorDisplay
          error={error}
          title="Failed to load agenda"
          onRetry={retry}
          data-testid="agenda-error"
        />
      )}

      {(hasItems || (!loading && !error)) && (
        <>
          {error && (
            <div
              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
              data-testid="agenda-error-inline"
            >
              Failed to refresh agenda: {error.message}
            </div>
          )}

          <AgendaFilterBar
            items={rawItems}
            selectedLabels={selectedLabels}
            selectedStudents={selectedStudents}
            onToggleLabel={handleToggleLabel}
            onToggleStudent={handleToggleStudent}
            onClearFilters={handleClearFilters}
          />

          <div className="space-y-6" data-testid="agenda-list">
            {filteredItems.length === 0 ? (
              <div className="text-muted-foreground text-sm" data-testid="agenda-empty">
                {rawItems.length === 0
                  ? 'No upcoming items.'
                  : 'No items match the current filters.'}
              </div>
            ) : (
              grouped.map(
                (group) =>
                  group.items.length > 0 && (
                    <AgendaDateGroup
                      key={group.label}
                      label={group.label}
                      items={group.items}
                      onSnooze={handleSnooze}
                      onReminderSent={refresh}
                    />
                  )
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
