'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { IStudent, IStudentGradesResponse, ICourseGrade } from '@/lib/api/students';

/** Show letter grade prominently (default) or numeric score. Schools use different scales. */
export type GradeDisplayMode = 'letter' | 'score';

export interface StudentGradePanelProps {
  student: IStudent;
  grades: IStudentGradesResponse | null;
  loading?: boolean;
  /** 'letter' = letter grade prominent; 'score' = numeric % prominent. Default 'letter'. */
  displayMode?: GradeDisplayMode;
}

function gradeBarColor(grade: number): string {
  if (grade >= 80) return 'bg-emerald-500';
  if (grade >= 70) return 'bg-amber-500';
  if (grade >= 60) return 'bg-orange-500';
  return 'bg-red-500';
}

function letterGradeColor(grade: number): string {
  if (grade >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (grade >= 70) return 'text-amber-600 dark:text-amber-400';
  if (grade >= 60) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

export interface GradeBarProps {
  course: ICourseGrade;
  studentId: string;
  displayMode?: GradeDisplayMode;
}

function GradeBar({ course, studentId, displayMode = 'letter' }: GradeBarProps) {
  const pct = Math.min(100, Math.max(0, course.grade));
  const gradesHref = `/dashboard/students/${studentId}/grades?course=${encodeURIComponent(course.courseExternalId)}`;
  const showLetterProminent = displayMode === 'letter';

  return (
    <Link
      href={gradesHref}
      className="block space-y-1 rounded-md p-2 -m-2 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
      data-testid={`grade-bar-${course.courseExternalId}`}
      aria-label={`${course.courseName}: ${course.letterGrade} (${course.grade}%). View grade summary`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium truncate text-sm" title={course.courseName}>
          {course.courseName}
        </span>
        <div className="flex shrink-0 items-baseline gap-2">
          {showLetterProminent ? (
            <>
              <span className={`text-xl font-bold tabular-nums ${letterGradeColor(course.grade)}`}>
                {course.letterGrade}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {course.grade}%
              </span>
            </>
          ) : (
            <>
              <span className="text-xl font-bold tabular-nums text-foreground">
                {course.grade}%
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {course.letterGrade}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-[width] ${gradeBarColor(course.grade)}`}
          style={{ width: `${pct}%` }}
          role="presentation"
          aria-hidden
        />
      </div>
    </Link>
  );
}

function PanelSkeleton() {
  return (
    <Card data-testid="student-grade-panel-skeleton">
      <CardHeader>
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-1">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function StudentGradePanel({ student, grades, loading, displayMode = 'letter' }: StudentGradePanelProps) {
  if (loading) {
    return <PanelSkeleton />;
  }

  const courseGrades = grades?.courseGrades ?? [];

  return (
    <Card data-testid={`student-grade-panel-${student.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/dashboard/students/${student.id}/view`}
            className="text-lg font-semibold leading-tight hover:underline"
            data-testid={`student-grade-panel-name-${student.id}`}
          >
            {student.name}
          </Link>
          <Link
            href={`/dashboard/students/${student.id}/view`}
            className="text-xs font-medium text-primary hover:underline"
            data-testid={`student-grade-panel-view-link-${student.id}`}
          >
            View as student
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {courseGrades.length > 0 ? (
          courseGrades.map((course) => (
            <GradeBar
              key={course.courseExternalId}
              course={course}
              studentId={student.id}
              displayMode={displayMode}
            />
          ))
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center">
            <p className="text-sm text-muted-foreground" data-testid={`student-grade-panel-empty-${student.id}`}>
              No grades yet
            </p>
            <Link
              href={`/dashboard/students/${student.id}/grades`}
              className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
            >
              View grades
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
