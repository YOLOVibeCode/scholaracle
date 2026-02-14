'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { sourcesApi, type IIngestRun } from '@/lib/api/sources';
import { Badge } from '@/components/ui/badge';

export interface SyncHistorySheetProps {
  studentId: string;
  sourceId: string;
  onClose: () => void;
  onSyncDone?: () => void;
}

export function SyncHistorySheet({
  studentId,
  sourceId,
  onClose,
  onSyncDone,
}: SyncHistorySheetProps) {
  const [runs, setRuns] = useState<readonly IIngestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    if (!studentId || !sourceId) return;
    void loadRuns();
  }, [studentId, sourceId]);

  const loadRuns = async () => {
    setLoading(true);
    const list = await sourcesApi.listRuns(studentId, sourceId);
    setRuns(list);
    setLoading(false);
  };

  const handleTriggerSync = async () => {
    setTriggering(true);
    const run = await sourcesApi.triggerSync(studentId, sourceId);
    setTriggering(false);
    if (run) {
      void loadRuns();
      onSyncDone?.();
    }
  };

  const formatDuration = (run: IIngestRun): string => {
    const start = new Date(run.startedAt).getTime();
    const end = run.committedAt
      ? new Date(run.committedAt).getTime()
      : run.uploadedAt
        ? new Date(run.uploadedAt).getTime()
        : Date.now();
    const sec = Math.round((end - start) / 1000);
    return `${sec}s`;
  };

  return (
    <Sheet open={!!sourceId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-lg" data-testid="sync-history-sheet">
        <SheetHeader>
          <SheetTitle>Sync History</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 py-4">
          {loading ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">Loading runs...</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">No sync runs yet.</p>
          ) : (
            <div className="space-y-2" data-testid="sync-runs-list">
              {runs.map((run) => (
                <div
                  key={run.runId}
                  className="flex items-center justify-between rounded border p-2 text-sm"
                  data-testid={`run-${run.runId}`}
                >
                  <div className="min-w-0">
                    <span className="font-mono text-xs truncate block">{run.runId.slice(0, 8)}</span>
                    <span className="text-gray-600 dark:text-gray-400">
                      {new Date(run.startedAt).toLocaleString()}
                    </span>
                    {run.error && (
                      <p className="text-red-600 dark:text-red-400 text-xs mt-1 truncate" title={run.error}>
                        {run.error}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={
                      run.status === 'committed' ? 'default' : run.status === 'failed' ? 'destructive' : 'secondary'
                    }
                  >
                    {run.status}
                  </Badge>
                  <span className="text-xs text-gray-500">{formatDuration(run)}</span>
                </div>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={handleTriggerSync}
            disabled={triggering}
            data-testid="button-trigger-sync"
          >
            {triggering ? 'Starting...' : 'Trigger Manual Sync'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
