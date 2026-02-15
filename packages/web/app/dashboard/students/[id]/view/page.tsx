'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, Calendar, BookOpen, GraduationCap } from 'lucide-react';
import { useStudentView } from '@/lib/contexts/StudentViewContext';
import { agendaApi, type IAgendaItem } from '@/lib/api/agenda';
import { alertsApi, type IAlert } from '@/lib/api/alerts';
import { useAsyncData } from '@/lib/hooks';
import { ErrorDisplay, LoadingSkeleton } from '@/components/common';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function StudentViewDashboardPage() {
  const params = useParams();
  const studentId = params?.id as string | undefined;
  const { studentName, studentExternalId, studentLoading, studentLoadError, clearStudentView } = useStudentView();

  const range = useMemo(() => {
    const from = startOfDay(new Date());
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { from, to };
  }, []);

  const { data: agendaResponse, isLoading: agendaLoading, error: agendaError, retry: agendaRetry } = useAsyncData(
    async () => {
      const res = await agendaApi.getRange(range.from.toISOString(), range.to.toISOString());
      if (!res.success || !res.data) throw new Error(res.error ?? 'Failed to load agenda');
      return res.data;
    },
    { retryCount: 2, retryDelay: 1000 }
  );

  const { data: allAlerts, isLoading: alertsLoading, error: alertsError, retry: alertsRetry } = useAsyncData(
    () => alertsApi.getAll(),
    { retryCount: 2, retryDelay: 1000 }
  );

  const items = agendaResponse?.items ?? [];
  const studentItems = useMemo(() => {
    if (!studentName && !studentExternalId) return items;
    return items.filter(
      (item) =>
        item.studentName === studentName ||
        (studentExternalId && item.studentExternalId === studentExternalId)
    );
  }, [items, studentName, studentExternalId]);

  const studentAlerts = useMemo(() => {
    const list = allAlerts ?? [];
    if (!studentExternalId) return list;
    return list.filter((a: IAlert) => a.studentId === studentExternalId);
  }, [allAlerts, studentExternalId]);

  const todayPlan = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const overdue = studentItems.filter((i) => new Date(i.timeAt) < now && (i.isOverdue || i.assignmentStatus === 'missing'));
    const dueToday = studentItems.filter(
      (i) => new Date(i.timeAt) >= todayStart && new Date(i.timeAt) < todayEnd
    );
    const upcoming = studentItems.filter((i) => new Date(i.timeAt) >= todayEnd).slice(0, 5);
    return { overdue, dueToday, upcoming };
  }, [studentItems]);

  const isLoading = agendaLoading || alertsLoading;
  const error = agendaError ?? alertsError;
  const retry = () => {
    agendaRetry();
    alertsRetry();
  };

  if (!studentId) {
    return (
      <div className="space-y-6" data-testid="student-view-invalid">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invalid student</h1>
          <p className="text-gray-600 dark:text-gray-400">No student ID in the URL.</p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (studentLoadError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Student not found</h1>
          <p className="text-gray-600 dark:text-gray-400">
            We couldn&apos;t find this student. The link may be outdated or the student may have been removed.
          </p>
        </div>
        <Link
          href="/dashboard"
          onClick={(e) => {
            e.preventDefault();
            clearStudentView();
          }}
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          data-testid="student-not-found-back"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (studentLoading) {
    return (
      <div className="space-y-6" data-testid="student-view-loading">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Student Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400">Loading student…</p>
        </div>
        <LoadingSkeleton variant="dashboard" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 data-testid="student-view-header" className="text-3xl font-bold tracking-tight">
          {studentName ?? 'Student'} Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400">Your agenda, alerts, and plan</p>
      </div>

      {isLoading && !error && <LoadingSkeleton variant="dashboard" />}
      {error && !isLoading && (
        <ErrorDisplay error={error} title="Failed to load student view" onRetry={retry} />
      )}
      {!isLoading && !error && (
        <>
          {/* Today's plan */}
          <Card data-testid="student-view-todays-plan">
            <CardHeader>
              <CardTitle>Today&apos;s plan</CardTitle>
              <CardDescription>Priorities from your agenda</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {todayPlan.overdue.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Overdue</p>
                  <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400">
                    {todayPlan.overdue.slice(0, 5).map((i) => (
                      <li key={i.id}>{i.title}</li>
                    ))}
                  </ul>
                </div>
              )}
              {todayPlan.dueToday.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Due today</p>
                  <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400">
                    {todayPlan.dueToday.map((i) => (
                      <li key={i.id}>{i.title}</li>
                    ))}
                  </ul>
                </div>
              )}
              {todayPlan.upcoming.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Upcoming</p>
                  <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400">
                    {todayPlan.upcoming.map((i) => (
                      <li key={i.id}>{i.title}</li>
                    ))}
                  </ul>
                </div>
              )}
              {todayPlan.overdue.length === 0 && todayPlan.dueToday.length === 0 && todayPlan.upcoming.length === 0 && (
                <p className="text-sm text-gray-600 dark:text-gray-400">Nothing scheduled for now.</p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Recent Alerts
                </CardTitle>
                <CardDescription>Alerts for you</CardDescription>
              </CardHeader>
              <CardContent>
                {studentAlerts.length > 0 ? (
                  <ul className="space-y-2" data-testid="student-view-alerts-list">
                    {studentAlerts
                      .filter((a: IAlert) => !a.acknowledged)
                      .slice(0, 5)
                      .map((a: IAlert) => (
                        <li key={a.id} className="text-sm" data-testid={`student-view-alert-${a.id}`}>
                          <p className="font-medium">{a.message}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {new Date(a.createdAt).toLocaleDateString()}
                          </p>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400" data-testid="student-view-alerts-empty">
                    No alerts
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Next up
                </CardTitle>
                <CardDescription>From your agenda</CardDescription>
              </CardHeader>
              <CardContent>
                {studentItems.length > 0 ? (
                  <ul className="space-y-2" data-testid="student-view-agenda-list">
                    {[...studentItems]
                      .sort((a, b) => new Date(a.timeAt).getTime() - new Date(b.timeAt).getTime())
                      .slice(0, 5)
                      .map((i: IAgendaItem) => (
                        <li key={i.id} className="text-sm" data-testid={`student-view-agenda-${i.id}`}>
                          <p className="font-medium">{i.title}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {i.courseName ?? i.courseExternalId ?? 'Course'} •{' '}
                            {new Date(i.timeAt).toLocaleDateString()}
                          </p>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400" data-testid="student-view-agenda-empty">
                    No upcoming items
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              <Link
                href={`/dashboard/students/${studentId}/grades`}
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                data-testid="student-view-grades-link"
              >
                <GraduationCap className="h-4 w-4" />
                View grades
              </Link>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
