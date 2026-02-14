'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GraduationCap, BookOpen, Bell, TrendingUp, X } from 'lucide-react';
import { dashboardApi, type IDashboardStats } from '@/lib/api/dashboard';
import { useAsyncData } from '@/lib/hooks';
import { ErrorDisplay, LoadingSkeleton } from '@/components/common';

export default function DashboardPage() {
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const { data: stats, isLoading, error, retry } = useAsyncData<IDashboardStats>(
    () => dashboardApi.getStats(),
    { retryCount: 2, retryDelay: 1000 }
  );

  const showOnboardingBanner =
    !onboardingDismissed && !isLoading && !error && stats && (stats.totalStudents ?? 0) === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 data-testid="dashboard-header" className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400">Welcome to Scholaracle</p>
      </div>

      {showOnboardingBanner && (
        <Card data-testid="onboarding-banner" className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/20">
          <CardContent className="flex flex-row items-center justify-between gap-4 pt-6">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Get started by adding your first student to track their courses and alerts.
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button asChild size="sm" data-testid="onboarding-add-student-cta">
                <Link href="/dashboard/students/new">Add student</Link>
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
          </CardContent>
        </Card>
      )}

      {isLoading && !error && <LoadingSkeleton variant="dashboard" />}
      {error && !isLoading && <ErrorDisplay error={error} title="Failed to load dashboard" onRetry={retry} />}
      {!isLoading && !error && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Students</CardTitle>
                <GraduationCap className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="student-count">
                  {stats?.totalStudents ?? 0}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Total students</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Courses</CardTitle>
                <BookOpen className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalCourses ?? 0}</div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Enrolled courses</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Alerts</CardTitle>
                <Bell className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalAlerts ?? 0}</div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Pending alerts</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Average GPA</CardTitle>
                <TrendingUp className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats?.averageGPA !== null && stats?.averageGPA !== undefined
                    ? stats.averageGPA.toFixed(2)
                    : '-'}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Overall performance</p>
              </CardContent>
            </Card>
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
    </div>
  );
}

