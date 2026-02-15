'use client';

import { useCallback, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { integrationsApi } from '@/lib/api/integrations';
import { sourcesApi } from '@/lib/api/sources';
import { useAsyncData } from '@/lib/hooks';
import { ErrorDisplay } from '@/components/common';
import { AssignStudentSheet } from '@/components/dashboard/integrations/AssignStudentSheet';
import { SourceCredentialsSheet } from '@/components/dashboard/students/SourceCredentialsSheet';
import { SyncHistorySheet } from '@/components/dashboard/students/SyncHistorySheet';

export default function IntegrationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const integrationId = params.id as string;

  const [assignSheetOpen, setAssignSheetOpen] = useState(false);
  const [credentialsStudentId, setCredentialsStudentId] = useState<string | null>(null);
  const [runsStudentId, setRunsStudentId] = useState<string | null>(null);

  const fetchIntegration = useCallback(() => integrationsApi.get(integrationId), [integrationId]);
  const { data: integration, isLoading, error, retry, refresh } = useAsyncData(fetchIntegration, {
    retryCount: 2,
    retryDelay: 1000,
  });

  const fetchStudents = useCallback(
    () => (integrationId ? integrationsApi.listStudents(integrationId) : Promise.resolve([])),
    [integrationId]
  );
  const { data: linkedStudents, refresh: refreshStudents } = useAsyncData(fetchStudents, {
    retryCount: 1,
  });

  const handleAssigned = () => {
    refresh();
    refreshStudents();
  };

  const handleCredentialsSaved = () => {
    refreshStudents();
    setCredentialsStudentId(null);
  };

  const handleUnlink = async (studentId: string) => {
    if (!integrationId) return;
    const ok = await integrationsApi.unlinkStudent(integrationId, studentId);
    if (ok) {
      refresh();
      refreshStudents();
    }
  };

  const handleTriggerSync = async (studentId: string) => {
    if (!integrationId) return;
    await sourcesApi.triggerSync(studentId, integrationId);
    refreshStudents();
  };

  if (!integrationId) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Missing integration ID.</p>
        <Button asChild variant="outline">
          <Link href="/dashboard/integrations">Back to Integrations</Link>
        </Button>
      </div>
    );
  }

  if (isLoading && !integration) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (error && !integration) {
    return (
      <div className="space-y-4">
        <ErrorDisplay error={error} title="Failed to load integration" onRetry={retry} />
        <Button asChild variant="outline">
          <Link href="/dashboard/integrations">Back to Integrations</Link>
        </Button>
      </div>
    );
  }

  if (!integration) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Integration not found.</p>
        <Button asChild variant="outline">
          <Link href="/dashboard/integrations">Back to Integrations</Link>
        </Button>
      </div>
    );
  }

  const linked = linkedStudents ?? [];
  const linkedIds = linked.map((s) => s.studentId);

  return (
    <div className="space-y-6" data-testid="integration-detail-page">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/dashboard/integrations" aria-label="Back to Integrations">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{integration.displayName}</h1>
          <p className="text-muted-foreground">{integration.provider} • {integration.portalBaseUrl ?? 'No URL'}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>Schedule and data types for this integration.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>Schedule:</strong> {integration.schedule}</p>
          <p><strong>Data types:</strong> {integration.dataTypes.join(', ')}</p>
          <p><strong>Status:</strong> <Badge variant={integration.enabled ? 'default' : 'secondary'}>{integration.enabled ? 'Enabled' : 'Disabled'}</Badge></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Linked students</CardTitle>
            <CardDescription>Students using this integration with their own credentials.</CardDescription>
          </div>
          <Button onClick={() => setAssignSheetOpen(true)} data-testid="button-assign-student">
            Assign student
          </Button>
        </CardHeader>
        <CardContent>
          {linked.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students linked yet. Assign a student to add their credentials.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Credentials</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last sync</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linked.map((row) => (
                  <TableRow key={row.studentId}>
                    <TableCell>
                      <Link
                        href={`/dashboard/students/${row.studentId}`}
                        className="font-medium hover:underline"
                      >
                        {row.studentName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {row.hasCredentials ? (
                        <Badge variant="secondary">Set</Badge>
                      ) : (
                        <span className="text-muted-foreground">Not set</span>
                      )}
                    </TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.lastSuccess ? new Date(row.lastSuccess).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCredentialsStudentId(row.studentId)}
                        data-testid={`credentials-${row.studentId}`}
                      >
                        {row.hasCredentials ? 'Update credentials' : 'Add credentials'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTriggerSync(row.studentId)}
                        data-testid={`sync-${row.studentId}`}
                      >
                        Sync
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRunsStudentId(row.studentId)}
                        data-testid={`runs-${row.studentId}`}
                      >
                        View runs
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleUnlink(row.studentId)}
                        data-testid={`unlink-${row.studentId}`}
                      >
                        Unlink
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AssignStudentSheet
        open={assignSheetOpen}
        integrationId={integrationId}
        integrationDisplayName={integration.displayName}
        linkedStudentIds={linkedIds}
        onClose={() => setAssignSheetOpen(false)}
        onAssigned={handleAssigned}
      />

      {credentialsStudentId && (
        <SourceCredentialsSheet
          open={true}
          studentId={credentialsStudentId}
          sourceId={integrationId}
          displayName={integration.displayName}
          onClose={() => setCredentialsStudentId(null)}
          onSaved={handleCredentialsSaved}
        />
      )}

      {runsStudentId && (
        <SyncHistorySheet
          studentId={runsStudentId}
          sourceId={integrationId}
          onClose={() => setRunsStudentId(null)}
          onSyncDone={refreshStudents}
        />
      )}
    </div>
  );
}
