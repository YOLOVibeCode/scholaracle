'use client';

import { useEffect, useState } from 'react';
import { Bell, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { studentsApi, type IStudent, type IStudentAlert } from '@/lib/api/students';
import { Badge } from '@/components/ui/badge';

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200',
  positive: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200',
};

export interface StudentAlertsTabProps {
  studentId: string;
  student: { alertPreferences?: IStudent['alertPreferences'] } | null;
  onSaveOverrides?: (prefs: { useCustomSettings?: boolean; gradeDrop?: number; lowGradeThreshold?: number; frequency?: string }) => void;
}

export function StudentAlertsTab({ studentId, student, onSaveOverrides }: StudentAlertsTabProps) {
  const [alerts, setAlerts] = useState<readonly IStudentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [useCustomSettings, setUseCustomSettings] = useState(false);
  const [gradeDrop, setGradeDrop] = useState(5);
  const [lowGradeThreshold, setLowGradeThreshold] = useState(80);
  const [frequency, setFrequency] = useState<'minimal' | 'balanced' | 'proactive'>('balanced');

  useEffect(() => {
    void loadAlerts();
  }, [studentId]);

  useEffect(() => {
    if (student?.alertPreferences) {
      setUseCustomSettings(student.alertPreferences.useCustomSettings ?? false);
      setGradeDrop(student.alertPreferences.gradeDrop ?? 5);
      setLowGradeThreshold(student.alertPreferences.lowGradeThreshold ?? 80);
      setFrequency((student.alertPreferences.frequency as 'minimal' | 'balanced' | 'proactive') ?? 'balanced');
    }
  }, [student?.alertPreferences]);

  const loadAlerts = async () => {
    setLoading(true);
    const list = await studentsApi.getAlerts(studentId);
    setAlerts(list);
    setLoading(false);
  };

  const handleSaveOverrides = () => {
    onSaveOverrides?.({
      useCustomSettings,
      gradeDrop,
      lowGradeThreshold,
      frequency,
    });
  };

  const handleAcknowledge = async (id: string) => {
    const { alertsApi } = await import('@/lib/api/alerts');
    await alertsApi.acknowledge(id);
    void loadAlerts();
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-600 dark:text-gray-400" data-testid="loading-alerts">
        Loading alerts...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card data-testid="alert-overrides-card">
        <CardHeader>
          <CardTitle>Alert preferences for this student</CardTitle>
          <CardDescription>Override your global settings for this student only</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              id="use-custom-settings"
              type="checkbox"
              checked={useCustomSettings}
              onChange={(e) => setUseCustomSettings(e.target.checked)}
              data-testid="checkbox-use-custom-settings"
            />
            <Label htmlFor="use-custom-settings">Use custom settings for this student</Label>
          </div>
          {useCustomSettings && (
            <div className="space-y-4 pl-6 border-l">
              <div className="space-y-2">
                <Label htmlFor="override-grade-drop">Grade drop threshold (points)</Label>
                <input
                  id="override-grade-drop"
                  type="number"
                  min={1}
                  max={100}
                  value={gradeDrop}
                  onChange={(e) => setGradeDrop(Number(e.target.value))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="override-low-grade">Low grade threshold</Label>
                <input
                  id="override-low-grade"
                  type="number"
                  min={0}
                  max={100}
                  value={lowGradeThreshold}
                  onChange={(e) => setLowGradeThreshold(Number(e.target.value))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <div className="flex gap-4">
                  {(['minimal', 'balanced', 'proactive'] as const).map((f) => (
                    <label key={f} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="frequency"
                        value={f}
                        checked={frequency === f}
                        onChange={() => setFrequency(f)}
                      />
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </label>
                  ))}
                </div>
              </div>
              <Button type="button" onClick={handleSaveOverrides} data-testid="button-save-overrides">
                Save overrides
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h3 className="text-lg font-semibold mb-2">Recent alerts</h3>
        {alerts.length === 0 ? (
          <Card data-testid="empty-alerts">
            <CardContent className="flex flex-col items-center justify-center py-8">
              <Bell className="h-10 w-10 text-gray-400 mb-2" />
              <p className="text-sm text-gray-600 dark:text-gray-400">No alerts for this student.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2" data-testid="student-alerts-list">
            {alerts.map((alert) => (
              <Card key={alert.id}>
                <CardHeader className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm">{alert.type.replace(/_/g, ' ')}</CardTitle>
                      <CardDescription>{alert.message}</CardDescription>
                      <Badge className={severityColors[alert.severity] ?? severityColors.info} variant="secondary">
                        {alert.severity}
                      </Badge>
                    </div>
                    {!alert.acknowledged && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleAcknowledge(alert.id)}
                        data-testid="button-acknowledge"
                      >
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Acknowledge
                      </Button>
                    )}
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
