'use client';

import { useEffect, useState } from 'react';
import { Bell, CheckCircle, AlertCircle, Info, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { alertsApi, type IAlert } from '@/lib/api/alerts';

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

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<readonly IAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void loadAlerts();
  }, []);

  const loadAlerts = async () => {
    setIsLoading(true);
    try {
      const data = await alertsApi.getAll();
      setAlerts(data);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load alerts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcknowledge = async (id: string) => {
    const success = await alertsApi.acknowledge(id);
    if (success) {
      void loadAlerts();
    }
  };

  const unacknowledgedAlerts = alerts.filter((alert) => !alert.acknowledged);
  const acknowledgedAlerts = alerts.filter((alert) => alert.acknowledged);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Alerts</h1>
        <p className="text-gray-600 dark:text-gray-400">View and manage your notifications</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-600 dark:text-gray-400">Loading alerts...</div>
      ) : (
        <>
          {unacknowledgedAlerts.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Active Alerts</h2>
              {unacknowledgedAlerts.map((alert) => {
                const Icon = severityIcons[alert.severity as keyof typeof severityIcons] ?? Bell;
                const colorClass =
                  severityColors[alert.severity as keyof typeof severityColors] ?? severityColors.info;

                return (
                  <Card key={alert.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <Icon className={`h-5 w-5 mt-0.5 ${colorClass.split(' ')[0]}`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <CardTitle className="text-lg">{alert.type}</CardTitle>
                              <Badge className={colorClass}>{alert.severity}</Badge>
                            </div>
                            <CardDescription>{alert.message}</CardDescription>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAcknowledge(alert.id)}
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
                  <Card key={alert.id} className="opacity-60">
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

          {alerts.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bell className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No alerts</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  You're all caught up! No alerts at this time.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

