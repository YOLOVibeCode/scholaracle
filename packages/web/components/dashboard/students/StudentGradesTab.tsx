'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { studentsApi, type IStudentGradesResponse } from '@/lib/api/students';
import { CourseGradeCard } from './CourseGradeCard';

export interface StudentGradesTabProps {
  studentId: string;
}

export function StudentGradesTab({ studentId }: StudentGradesTabProps) {
  const [data, setData] = useState<IStudentGradesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await studentsApi.getGrades(studentId);
        if (!cancelled && res) setData(res);
        else if (!cancelled) setError('Failed to load grades');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load grades');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (loading) {
    return (
      <div className="text-muted-foreground py-8 text-center" data-testid="grades-tab-loading">
        Loading grades...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200" data-testid="grades-tab-error">
        {error}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const courseGrades = data.courseGrades;

  return (
    <div className="space-y-6" data-testid="grades-tab">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Overall GPA: <strong className="text-foreground">{data.overallGPA.toFixed(1)}</strong>
          {data.atRiskCourses > 0 && (
            <span className="ml-2 text-amber-600 dark:text-amber-400">
              · {data.atRiskCourses} course(s) at risk
            </span>
          )}
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/students/${studentId}/grades`}>View all grades</Link>
        </Button>
      </div>

      {data.aiOverview && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm" data-testid="grades-ai-overview">
          {data.aiOverview}
        </div>
      )}

      {courseGrades.length === 0 ? (
        <div className="rounded-lg border bg-muted/20 p-8 text-center text-muted-foreground">
          No course grades yet. Connect a data source to see grades.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="grades-course-grid">
          {courseGrades.map((course) => (
            <CourseGradeCard key={course.courseExternalId} studentId={studentId} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}
