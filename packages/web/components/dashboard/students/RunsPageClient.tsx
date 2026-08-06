'use client';

/**
 * Unified Runs page — shows ingest runs with client identity from meta.
 */

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';

interface IRunRow {
  readonly runId: string;
  readonly sourceId: string;
  readonly status: string;
  readonly startedAt: string;
  readonly clientType?: string;
  readonly coreVersion?: string;
  readonly error?: string | null;
}

export function RunsPageClient({ studentId }: { readonly studentId: string }): React.ReactElement {
  const [runs, setRuns] = useState<IRunRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const sources = await apiClient.get<Array<{ id?: string; sourceId?: string }>>(
          `/students/${studentId}/sources`,
        );
        const all: IRunRow[] = [];
        for (const s of sources) {
          const sid = s.sourceId ?? s.id;
          if (!sid) continue;
          try {
            const rows = await apiClient.get<
              Array<{
                runId: string;
                sourceId: string;
                status: string;
                startedAt: string;
                error?: string | null;
                clientMeta?: Record<string, string>;
              }>
            >(`/students/${studentId}/sources/${sid}/runs`);
            for (const r of rows) {
              all.push({
                runId: r.runId,
                sourceId: r.sourceId,
                status: r.status,
                startedAt: r.startedAt,
                error: r.error,
                clientType: r.clientMeta?.['clientType'],
                coreVersion: r.clientMeta?.['coreVersion'],
              });
            }
          } catch {
            // skip source
          }
        }
        all.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
        setRuns(all.slice(0, 50));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load runs');
      } finally {
        setLoading(false);
      }
    })();
  }, [studentId]);

  if (loading) return <p className="text-sm text-muted-foreground p-4">Loading runs…</p>;
  if (error) return <p className="text-sm text-destructive p-4">{error}</p>;
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground p-4">No sync runs yet. Sync from the mobile app or browser extension.</p>;
  }

  return (
    <div className="space-y-2 p-4" data-testid="runs-page">
      <h2 className="text-lg font-semibold">Sync runs</h2>
      <ul className="divide-y rounded-lg border bg-white dark:bg-gray-950">
        {runs.map((r) => (
          <li key={r.runId} className="flex flex-col gap-1 p-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{r.sourceId}</span>
              <span className={r.status === 'committed' || r.status === 'success' ? 'text-green-600' : 'text-red-600'}>
                {r.status}
              </span>
            </div>
            <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
              <span>{new Date(r.startedAt).toLocaleString()}</span>
              {r.clientType && <span>client: {r.clientType}</span>}
              {r.coreVersion && <span>core: {r.coreVersion}</span>}
            </div>
            {r.error && <p className="text-xs text-red-600">{r.error}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
