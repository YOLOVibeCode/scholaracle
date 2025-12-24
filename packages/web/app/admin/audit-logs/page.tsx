'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAsyncData } from '@/lib/hooks';
import { ErrorDisplay, LoadingSkeleton } from '@/components/common';
import { adminAuditLogsApi, type IAdminAuditLogItem } from '@/lib/api/admin/audit-logs';
import { AdminStepUpSheet, AuditLogDetailSheet } from '@/components/admin';

export default function AdminAuditLogsPage() {
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [page, setPage] = useState(1);
  const limit = 25;
  const [toast, setToast] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isStepUpOpen, setIsStepUpOpen] = useState(false);
  const [pendingExport, setPendingExport] = useState<null | Omit<Parameters<typeof adminAuditLogsApi.exportCsv>[0], 'page' | 'limit'>>(null);
  const [selected, setSelected] = useState<IAdminAuditLogItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const query = useMemo(
    () => ({
      page,
      limit,
      action: action.trim() || undefined,
      entityType: entityType.trim() || undefined,
      adminEmail: adminEmail.trim() || undefined,
    }),
    [action, adminEmail, entityType, page]
  );

  const exportQuery = useMemo(
    () => ({
      action: action.trim() || undefined,
      entityType: entityType.trim() || undefined,
      adminEmail: adminEmail.trim() || undefined,
    }),
    [action, adminEmail, entityType]
  );

  const { data: result, isLoading, error, retry, refresh } = useAsyncData<{
    readonly items: readonly IAdminAuditLogItem[];
    readonly total: number;
    readonly page: number;
    readonly totalPages: number;
  }>(
    async () => {
      const res = await adminAuditLogsApi.list(query);
      if (!res.success || !res.data) throw new Error(res.error ?? 'Failed to load audit logs');
      return {
        items: res.data,
        total: res.total ?? res.data.length,
        page: res.page ?? 1,
        totalPages: res.totalPages ?? 1,
      };
    },
    { retryCount: 1, retryDelay: 500 }
  );

  const items = result?.items ?? [];
  const hasLoadedOnce = result !== null;
  const showFullLoading = isLoading && !hasLoadedOnce;

  const downloadCsv = (csv: string) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExport = async (stepUpToken?: string) => {
    setToast(null);
    setIsExporting(true);
    try {
      const res = await adminAuditLogsApi.exportCsv(exportQuery, stepUpToken);
      if (!res.success) {
        if (res.code === 'MFA_STEP_UP_REQUIRED') {
          setPendingExport(exportQuery);
          setIsStepUpOpen(true);
          setToast('MFA re-verification required to export.');
          return;
        }
        setToast(res.error ?? 'Export failed');
        return;
      }
      downloadCsv(res.data ?? '');
      setToast('Export started.');
      // Refresh so the new system:export entry appears.
      refresh();
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="audit-logs-page">
      <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
      <p className="text-gray-600 dark:text-gray-400">Review sensitive admin actions and system events.</p>

      {toast && (
        <div role="alert" data-testid="toast" className="rounded-md border p-3 text-sm">
          {toast}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Narrow down results by action, entity, or admin email.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Input
            placeholder="Action (e.g. payment:refund)"
            value={action}
            onChange={(e) => {
              setPage(1);
              setAction(e.target.value);
            }}
            data-testid="audit-filter-action"
          />
          <Input
            placeholder="Entity type (e.g. customer)"
            value={entityType}
            onChange={(e) => {
              setPage(1);
              setEntityType(e.target.value);
            }}
            data-testid="audit-filter-entityType"
          />
          <Input
            placeholder="Admin email"
            value={adminEmail}
            onChange={(e) => {
              setPage(1);
              setAdminEmail(e.target.value);
            }}
            data-testid="audit-filter-adminEmail"
          />
          <div className="md:col-span-3 flex gap-2">
            <Button variant="outline" onClick={() => refresh()} data-testid="audit-refresh-button">
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleExport()}
              disabled={isExporting}
              data-testid="audit-export-button"
            >
              {isExporting ? 'Exporting…' : 'Export CSV'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setAction('');
                setEntityType('');
                setAdminEmail('');
                setPage(1);
              }}
              data-testid="audit-clear-button"
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit Events</CardTitle>
          <CardDescription>Most recent events first.</CardDescription>
        </CardHeader>
        <CardContent>
          {showFullLoading && <LoadingSkeleton variant="list" count={8} />}
          {error && !showFullLoading && <ErrorDisplay error={error} title="Failed to load audit logs" onRetry={retry} />}

          {(hasLoadedOnce || (!showFullLoading && !error)) && (
            <>
              <Table data-testid="audit-logs-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((x) => (
                    <TableRow
                      key={x.id}
                      data-testid="audit-log-row"
                      className="cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelected(x);
                        setIsDetailOpen(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setSelected(x);
                          setIsDetailOpen(true);
                        }
                      }}
                    >
                      <TableCell className="text-xs text-gray-600 dark:text-gray-400">
                        {new Date(x.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-gray-600 dark:text-gray-400">{x.adminEmail}</TableCell>
                      <TableCell>
                        <Badge variant={x.severity === 'critical' ? 'destructive' : 'secondary'}>{x.action}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-gray-600 dark:text-gray-400">
                        {x.entityType}
                        {x.entityId ? `:${x.entityId}` : ''}
                      </TableCell>
                      <TableCell className="text-xs text-gray-600 dark:text-gray-400">
                        {x.reason ?? ''}
                      </TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-sm text-gray-600 dark:text-gray-400" data-testid="audit-empty">
                        No audit logs found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <div className="mt-4 flex items-center justify-between">
                <div className="text-xs text-gray-600 dark:text-gray-400" data-testid="audit-pagination-meta">
                  Page {result?.page ?? 1} of {result?.totalPages ?? 1} • Total {result?.total ?? items.length}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={(result?.page ?? 1) <= 1}
                    data-testid="audit-prev"
                  >
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(result?.totalPages ?? p + 1, p + 1))}
                    disabled={(result?.page ?? 1) >= (result?.totalPages ?? 1)}
                    data-testid="audit-next"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AdminStepUpSheet
        open={isStepUpOpen}
        onOpenChange={(open) => {
          setIsStepUpOpen(open);
          if (!open) setPendingExport(null);
        }}
        onVerified={(token) => {
          const q = pendingExport ?? exportQuery;
          setPendingExport(null);
          void handleExport(token);
        }}
        title="Re-verify MFA to export"
        description="Exporting audit logs requires step-up authentication."
      />

      <AuditLogDetailSheet
        open={isDetailOpen}
        onOpenChange={(open) => setIsDetailOpen(open)}
        item={selected}
      />
    </div>
  );
}


