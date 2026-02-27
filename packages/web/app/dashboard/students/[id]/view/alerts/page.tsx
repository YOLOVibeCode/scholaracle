'use client';

import { Bell, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { alertsApi, type IAlert } from '@/lib/api/alerts';
import { useAsyncData } from '@/lib/hooks';
import { useStudentView } from '@/lib/contexts/StudentViewContext';
import { ErrorDisplay, LoadingSkeleton } from '@/components/common';

const severityColors = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200',
  positive: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200',
};

const severityIcons = {
  critical: AlertCircle,
  warning: AlertCircle,
  info: Info,
  positive: CheckCircle,
};

type AlertSeverityFilter = 'all' | 'critical' | 'warning' | 'info' | 'positive';

export default function StudentViewAlertsPage() {
  const { studentExternalId } = useStudentView();
  const { data: alertsData, isLoading, error, retry, refresh } = useAsyncData<readonly IAlert[]>(
    () => alertsApi.getAll(),
    { retryCount: 2, retryDelay: 1000 }
  );

  const studentAlerts = useMemo(() => {
    const list = alertsData ?? [];
    if (!studentExternalId) return list;
    return list.filter((a: IAlert) => a.studentId === studentExternalId);
  }, [alertsData, studentExternalId]);

  const [activeFilter, setActiveFilter] = useState<AlertSeverityFilter>('all');
  const [stableAlerts, setStableAlerts] = useState<readonly IAlert[]>([]);

  useEffect(() => {
    if (studentAlerts.length === 0) return;
    queueMicrotask(() => setStableAlerts(studentAlerts));
  }, [studentAlerts]);

  const alerts = alertsData !== null ? studentAlerts : stableAlerts;
  const hasLoadedOnce = alertsData !== null;
  const showFullLoading = isLoading && !hasLoadedOnce;

  const handleAcknowledge = async (id: string) => {
    const success = await alertsApi.acknowledge(id);
    if (success) refresh();
  };

  const filteredAlerts = useMemo(() => {
    if (activeFilter === 'all') return alerts;
    return alerts.filter((a) => a.severity === activeFilter);
  }, [activeFilter, alerts]);

  const unacknowledgedAlerts = filteredAlerts.filter((alert) => !alert.acknowledged);
  const acknowledgedAlerts = filteredAlerts.filter((alert) => alert.acknowledged);

  return (
    <div className="space-y-6" data-testid="student-view-alerts-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Alerts</h1>
        <p className="text-gray-600 dark:text-gray-400">Your notifications</p>
      </div>

      <div role="tablist" aria-label="Alert Filters" className="flex gap-2" data-testid="alert-filters">
        <button
          role="tab"
          aria-selected={activeFilter === 'all'}
          data-testid="filter-all"
          className="px-3 py-2 rounded border"
          onClick={() => setActiveFilter('all')}
          type="button"
        >
          All
        </button>
        <button
          role="tab"
          aria-selected={activeFilter === 'critical'}
          data-testid="filter-critical"
          className="px-3 py-2 rounded border"
          onClick={() => setActiveFilter('critical')}
          type="button"
        >
          Critical
        </button>
        <button
          role="tab"
          aria-selected={activeFilter === 'warning'}
          data-testid="filter-warning"
          className="px-3 py-2 rounded border"
          onClick={() => setActiveFilter('warning')}
          type="button"
        >
          Warning
        </button>
        <button
          role="tab"
          aria-selected={activeFilter === 'info'}
          data-testid="filter-info"
          className="px-3 py-2 rounded border"
          onClick={() => setActiveFilter('info')}
          type="button"
        >
          Info
        </button>
      </div>

      {showFullLoading ? (
        <LoadingSkeleton variant="list" count={5} />
      ) : (
        <>
          {error && (
            <ErrorDisplay error={error} title="Failed to load alerts" onRetry={retry} data-testid="alerts-error" />
          )}
          {unacknowledgedAlerts.length > 0 && (
            <div className="space-y-4" data-testid="alerts-list">
              <h2 className="text-xl font-semibold">Active Alerts</h2>
              {unacknowledgedAlerts.map((alert) => {
                const Icon = severityIcons[alert.severity as keyof typeof severityIcons] ?? Bell;
                const colorClass =
                  severityColors[alert.severity as keyof typeof severityColors] ?? severityColors.info;
                return (
                  <Card key={alert.id} data-testid="alert-item">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <Icon className={`h-5 w-5 mt-0.5 ${colorClass.split(' ')[0]}`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <CardTitle className="text-lg">{alert.type}</CardTitle>
                              <Badge className={colorClass} data-testid="alert-severity">
                                {alert.severity}
                              </Badge>
                            </div>
                            <CardDescription>{alert.message}</CardDescription>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAcknowledge(alert.id)}
                          data-testid="button-acknowledge"
                        >
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Acknowledge
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {new Date(alert.createdAt).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {acknowledgedAlerts.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Acknowledged Alerts</h2>
              {acknowledgedAlerts.map((alert) => {
                const Icon = severityIcons[alert.severity as keyof typeof severityIcons] ?? Bell;
                const colorClass =
                  severityColors[alert.severity as keyof typeof severityColors] ?? severityColors.info;
                return (
                  <Card key={alert.id} className="opacity-60" data-testid="alert-item">
                    <CardHeader>
                      <div className="flex items-start gap-3">
                        <Icon className={`h-5 w-5 mt-0.5 ${colorClass.split(' ')[0]}`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <CardTitle className="text-lg">{alert.type}</CardTitle>
                            <Badge className={colorClass}>{alert.severity}</Badge>
                            <Badge variant="outline">Acknowledged</Badge>
                          </div>
                          <CardDescription>{alert.message}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {new Date(alert.createdAt).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {filteredAlerts.length === 0 && (
            <Card data-testid="empty-state">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bell className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No alerts</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  You&apos;re all caught up.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
