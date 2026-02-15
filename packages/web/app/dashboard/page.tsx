'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Plus, GraduationCap, Plug } from 'lucide-react';
import { dashboardApi, type IDashboardStats } from '@/lib/api/dashboard';
import { studentsApi } from '@/lib/api/students';
import { settingsApi } from '@/lib/api/settings';
import { useAsyncData } from '@/lib/hooks';
import { ErrorDisplay, LoadingSkeleton } from '@/components/common';
import { StudentGradeStripRow } from '@/components/dashboard/StudentGradeStripRow';
import { AddStudentWizard } from '@/components/dashboard/AddStudentWizard';
import type { GradeDisplayMode } from '@/components/dashboard/StudentGradePanel';

export default function DashboardPage() {
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [gradeDisplayMode, setGradeDisplayMode] = useState<GradeDisplayMode>('letter');
  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    void settingsApi.get().then((settings) => {
      const mode = settings.dashboard?.gradeDisplay ?? 'letter';
      setGradeDisplayMode(mode as GradeDisplayMode);
    });
  }, []);

  const handleGradeDisplayToggle = () => {
    const next: GradeDisplayMode = gradeDisplayMode === 'letter' ? 'score' : 'letter';
    setGradeDisplayMode(next);
    void settingsApi.update({ dashboard: { gradeDisplay: next } });
  };

  const fetchStats = useCallback(() => dashboardApi.getStats(), []);
  const { data: stats, isLoading, error, retry } = useAsyncData<IDashboardStats>(
    fetchStats,
    { retryCount: 2, retryDelay: 1000 }
  );

  const fetchStudentsAndGrades = useCallback(async () => {
    const students = await studentsApi.getAll();
    const grades = await Promise.all(students.map((s) => studentsApi.getGrades(s.id)));
    return { students, grades };
  }, []);

  const { data: studentsAndGrades, isLoading: studentsSectionLoading, error: studentsSectionError, retry: studentsSectionRetry } = useAsyncData(
    fetchStudentsAndGrades,
    { retryCount: 2, retryDelay: 1000 }
  );

  const showOnboardingBanner =
    !onboardingDismissed &&
    !studentsSectionLoading &&
    !studentsSectionError &&
    studentsAndGrades &&
    studentsAndGrades.students.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 data-testid="dashboard-header" className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400">Welcome to Scholaracle</p>
      </div>

      {showOnboardingBanner && (
        <Card data-testid="onboarding-banner" className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/20">
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="rounded-full bg-blue-100 p-3 dark:bg-blue-900/40">
                <GraduationCap className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-1">Welcome to Scholaracle!</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
                  Add your first student and connect their grade portal so you can track courses, grades, and alerts — all in one place.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  data-testid="onboarding-add-student-cta"
                  onClick={() => setWizardOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add your first student
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Dismiss"
                  data-testid="button-onboarding-dismiss"
                  onClick={() => setOnboardingDismissed(true)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && !error && <LoadingSkeleton variant="dashboard" />}
      {error && !isLoading && <ErrorDisplay error={error} title="Failed to load dashboard" onRetry={retry} />}
      {!isLoading && !error && (
        <>
          <div data-testid="dashboard-grade-summary">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold tracking-tight">Grade summary</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGradeDisplayToggle}
                data-testid="grade-display-toggle"
                aria-pressed={gradeDisplayMode === 'score'}
                aria-label={gradeDisplayMode === 'letter' ? 'Show numeric score; currently showing letter grade' : 'Show letter grade; currently showing score'}
              >
                {gradeDisplayMode === 'letter' ? 'Show score' : 'Show letter'}
              </Button>
            </div>
            {studentsSectionLoading && (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map((i) => (
                  <StudentGradeStripRow
                    key={i}
                    student={{ id: '', userId: '', name: '…', grade: '' }}
                    grades={null}
                    loading
                    displayMode={gradeDisplayMode}
                  />
                ))}
              </div>
            )}
            {studentsSectionError && !studentsSectionLoading && (
              <Card>
                <CardContent className="pt-6">
                  <ErrorDisplay
                    error={studentsSectionError}
                    title="Failed to load grades"
                    onRetry={studentsSectionRetry}
                  />
                </CardContent>
              </Card>
            )}
            {!studentsSectionLoading && !studentsSectionError && studentsAndGrades && studentsAndGrades.students.length > 0 && (
              <div className="flex flex-col gap-2" data-testid="dashboard-grade-strip">
                {studentsAndGrades.students.map((student, i) => (
                  <StudentGradeStripRow
                    key={student.id}
                    student={student}
                    grades={studentsAndGrades.grades[i] ?? null}
                    displayMode={gradeDisplayMode}
                  />
                ))}
              </div>
            )}
            {!studentsSectionLoading && !studentsSectionError && studentsAndGrades && studentsAndGrades.students.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center py-8 text-center">
                  <Plug className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">Add students to see their grades here.</p>
                  <Button size="sm" onClick={() => setWizardOpen(true)} data-testid="grade-summary-add-student">
                    <Plus className="mr-2 h-4 w-4" />
                    Add student
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recent Alerts</CardTitle>
                <CardDescription>Latest notifications and alerts</CardDescription>
              </CardHeader>
              <CardContent data-testid="dashboard-recent-alerts">
                {stats?.recentAlerts && stats.recentAlerts.length > 0 ? (
                  <div className="space-y-2" data-testid="dashboard-alerts-list">
                    {stats.recentAlerts.map((alert) => (
                      <div key={alert.id} className="text-sm" data-testid={`dashboard-alert-${alert.id}`}>
                        <p className="font-medium">{alert.message}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {new Date(alert.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400" data-testid="dashboard-alerts-empty">No alerts yet</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Upcoming Deadlines</CardTitle>
                <CardDescription>Assignments due soon</CardDescription>
              </CardHeader>
              <CardContent data-testid="dashboard-upcoming-deadlines">
                {stats?.upcomingDeadlines && stats.upcomingDeadlines.length > 0 ? (
                  <div className="space-y-2" data-testid="dashboard-deadlines-list">
                    {stats.upcomingDeadlines.map((deadline) => (
                      <div key={deadline.id} className="text-sm" data-testid={`dashboard-deadline-${deadline.id}`}>
                        <p className="font-medium">{deadline.title}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {deadline.course} • Due {new Date(deadline.dueDate).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400" data-testid="dashboard-deadlines-empty">No upcoming deadlines</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <AddStudentWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onStudentAdded={() => {
          studentsSectionRetry();
          retry();
        }}
      />
    </div>
  );
}

