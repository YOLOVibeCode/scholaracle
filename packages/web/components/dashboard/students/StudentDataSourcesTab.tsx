'use client';

import { useEffect, useState } from 'react';
import { Link2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { sourcesApi, type IDataSource } from '@/lib/api/sources';
import { SyncHistorySheet } from './SyncHistorySheet';

export interface StudentDataSourcesTabProps {
  studentId: string;
  onConnectSource?: () => void;
}

export function StudentDataSourcesTab({ studentId, onConnectSource }: StudentDataSourcesTabProps) {
  const [sources, setSources] = useState<readonly IDataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [openRunSourceId, setOpenRunSourceId] = useState<string | null>(null);

  useEffect(() => {
    void loadSources();
  }, [studentId]);

  const loadSources = async () => {
    setLoading(true);
    const list = await sourcesApi.listForStudent(studentId);
    setSources(list);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-600 dark:text-gray-400" data-testid="loading-sources">
        Loading sources...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Connected Sources</h2>
        <Button
          type="button"
          onClick={onConnectSource}
          data-testid="button-connect-source"
        >
          <Plus className="mr-2 h-4 w-4" />
          Connect New Source
        </Button>
      </div>

      {sources.length === 0 ? (
        <Card data-testid="empty-sources">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Link2 className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No data sources connected</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 text-center">
              Connect an LMS (Canvas, Skyward, etc.) so we can sync grades and assignments.
            </p>
            <Button type="button" onClick={onConnectSource} data-testid="button-connect-source">
              <Plus className="mr-2 h-4 w-4" />
              Connect New Source
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3" data-testid="sources-list">
          {sources.map((source) => (
            <Card key={source.id} data-testid={`source-${source.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{source.displayName}</CardTitle>
                    <CardDescription>
                      {source.provider} · {source.schedule.replace('_', ' ')} ·{' '}
                      {source.lastSuccess ? `Last sync: ${new Date(source.lastSuccess).toLocaleString()}` : 'No sync yet'}
                    </CardDescription>
                  </div>
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      source.status === 'active' ? 'bg-green-500' : source.status === 'error' ? 'bg-red-500' : 'bg-gray-400'
                    }`}
                    aria-label={source.status}
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2 mb-2">
                  {source.dataTypes.map((t) => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800">
                      {t}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => setOpenRunSourceId(source.id)}
                    data-testid={`button-view-runs-${source.id}`}
                  >
                    View Runs
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {openRunSourceId && (
        <SyncHistorySheet
          studentId={studentId}
          sourceId={openRunSourceId}
          onClose={() => setOpenRunSourceId(null)}
          onSyncDone={() => void loadSources()}
        />
      )}
    </div>
  );
}
