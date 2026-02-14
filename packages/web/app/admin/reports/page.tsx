'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminReportsApi } from '@/lib/api/admin/reports';

function formatDateForInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function AdminReportsPage() {
  const now = new Date();
  const defaultEnd = formatDateForInput(now);
  const defaultStart = formatDateForInput(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()));

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const params = { startDate: startDate || undefined, endDate: endDate || undefined };

  const handleExport = async (
    name: string,
    fn: () => Promise<{ success: boolean; error?: string }>
  ) => {
    setLoading(name);
    setError(null);
    try {
      const result = await fn();
      if (!result.success) setError(result.error ?? 'Export failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-reports-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">Export data as CSV</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Date range</CardTitle>
          <CardDescription>Optional filter for exports (leave empty for all time)</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="reports-start">Start date</Label>
            <Input
              id="reports-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              data-testid="reports-start-date"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reports-end">End date</Label>
            <Input
              id="reports-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              data-testid="reports-end-date"
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <div
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          data-testid="reports-error"
        >
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Exports</CardTitle>
          <CardDescription>Download CSV files for customers, payments, and subscriptions</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() =>
                handleExport('customers', () => adminReportsApi.exportCustomers(params))
              }
              disabled={!!loading}
              data-testid="export-customers"
            >
              {loading === 'customers' ? 'Downloading…' : 'Export customers'}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                handleExport('payments', () => adminReportsApi.exportPayments(params))
              }
              disabled={!!loading}
              data-testid="export-payments"
            >
              {loading === 'payments' ? 'Downloading…' : 'Export payments'}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                handleExport('subscriptions', () => adminReportsApi.exportSubscriptions(params))
              }
              disabled={!!loading}
              data-testid="export-subscriptions"
            >
              {loading === 'subscriptions' ? 'Downloading…' : 'Export subscriptions'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
