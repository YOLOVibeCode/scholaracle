'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
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
      refresh();
    } finally {
      setIsExporting(false);
    }
  };

  const paginationState = useMemo(() => ({ pageIndex: (result?.page ?? 1) - 1, pageSize: limit }), [result?.page, limit]);
  const onPaginationChange = useCallback(
    (updater: (prev: { pageIndex: number; pageSize: number }) => { pageIndex: number; pageSize: number }) => {
      const next = updater(paginationState);
      setPage(next.pageIndex + 1);
    },
    [paginationState]
  );

  const auditColumns: ColumnDef<IAdminAuditLogItem, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'timestamp',
        header: 'Time',
        cell: ({ row }) => (
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {new Date(row.original.timestamp).toLocaleString()}
          </span>
        ),
      },
      { accessorKey: 'adminEmail', header: 'Admin', cell: ({ row }) => <span className="text-xs text-gray-600 dark:text-gray-400">{row.original.adminEmail}</span> },
      {
        accessorKey: 'action',
        header: 'Action',
        cell: ({ row }) => (
          <Badge variant={row.original.severity === 'critical' ? 'destructive' : 'secondary'}>
            {row.original.action}
          </Badge>
        ),
      },
      {
        accessorKey: 'entityType',
        header: 'Entity',
        cell: ({ row }) => (
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {row.original.entityType}
            {row.original.entityId ? `:${row.original.entityId}` : ''}
          </span>
        ),
      },
      { accessorKey: 'reason', header: 'Reason', cell: ({ row }) => <span className="text-xs text-gray-600 dark:text-gray-400">{row.original.reason ?? ''}</span> },
    ],
    []
  );

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
            <Button variant="outline" onClick={() => refresh()} data-testid="button-audit-refresh">
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleExport()}
              disabled={isExporting}
              data-testid="button-audit-export"
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
              data-testid="button-audit-clear"
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
              <div data-testid="audit-pagination-meta" className="sr-only">
                Page {result?.page ?? 1} of {result?.totalPages ?? 1} • Total {result?.total ?? items.length}
              </div>
              <div data-testid="audit-logs-table">
              <DataTable
                columns={auditColumns}
                data={items}
                pagination
                manualPagination
                pageCount={result?.totalPages ?? 1}
                pageSize={limit}
                state={{ pagination: paginationState }}
                onPaginationChange={onPaginationChange}
                getRowProps={(row) => ({
                  'data-testid': 'audit-log-row',
                  className: 'cursor-pointer',
                  role: 'button',
                  tabIndex: 0,
                  onClick: () => {
                    setSelected(row.original);
                    setIsDetailOpen(true);
                  },
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelected(row.original);
                      setIsDetailOpen(true);
                    }
                  },
                })}
              />
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


