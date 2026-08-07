'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { IStudent, IStudentGradesResponse, ICourseGrade } from '@/lib/api/students';
import type { GradeDisplayMode } from '@/components/dashboard/StudentGradePanel';
import { gradeBarColor, gradeTextColor } from '@/lib/grade-colors';

/** Min height per row in rem (~6.25rem). Responsive. */
const ROW_MIN_HEIGHT_REM = 6.25;

export interface StudentGradeStripRowProps {
  student: IStudent;
  grades: IStudentGradesResponse | null;
  displayMode?: GradeDisplayMode;
  /** Optional loading skeleton. */
  loading?: boolean;
}

function CompactCourseGrade({
  course,
  studentId,
  displayMode = 'letter',
}: {
  course: ICourseGrade;
  studentId: string;
  displayMode: GradeDisplayMode;
}) {
  const pct = Math.min(100, Math.max(0, course.grade));
  const gradesHref = `/dashboard/students/${studentId}/grades?course=${encodeURIComponent(course.courseExternalId)}`;
  const showLetter = displayMode === 'letter';

  return (
    <Link
      href={gradesHref}
      className="flex shrink-0 flex-col gap-0.5 rounded border border-transparent bg-muted/40 px-2 py-1 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={`${course.courseName}: ${course.letterGrade} (${course.grade}%)`}
      data-testid={`strip-row-grade-${course.courseExternalId}`}
    >
      <span className="truncate text-xs font-medium" style={{ maxWidth: '8rem' }}>
        {course.courseName}
      </span>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            'text-sm font-bold tabular-nums',
            showLetter ? gradeTextColor(course.grade) : 'text-foreground'
          )}
        >
          {showLetter ? course.letterGrade : `${course.grade}%`}
        </span>
        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full', gradeBarColor(course.grade))}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </Link>
  );
}

function StripRowSkeleton() {
  return (
    <div
      className="flex min-h-[var(--strip-row-height)] flex-col justify-center gap-2 rounded-lg border bg-muted/30 px-3 py-2"
      style={{ ['--strip-row-height' as string]: `${ROW_MIN_HEIGHT_REM}rem` }}
      data-testid="student-grade-strip-row-skeleton"
    >
      <div className="h-4 w-28 animate-pulse rounded bg-muted" />
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 w-20 animate-pulse rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}

/**
 * One thin row in the dashboard grade strip: student name on top, then a horizontal list of course grades.
 */
export function StudentGradeStripRow({
  student,
  grades,
  displayMode = 'letter',
  loading,
}: StudentGradeStripRowProps) {
  if (loading) {
    return <StripRowSkeleton />;
  }

  const courseGrades = grades?.courseGrades ?? [];

  return (
    <article
      className="flex min-h-[var(--strip-row-height)] flex-col justify-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm transition-colors hover:bg-muted/20"
      style={{ ['--strip-row-height' as string]: `${ROW_MIN_HEIGHT_REM}rem` }}
      data-testid={`student-grade-strip-row-${student.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/dashboard/students/${student.id}/view`}
          className="text-sm font-semibold leading-tight hover:underline"
          data-testid={`strip-row-name-${student.id}`}
        >
          {student.name}
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/students/${student.id}?tab=trends`}
            className="text-xs font-medium text-primary hover:underline"
            data-testid={`strip-row-trends-${student.id}`}
          >
            Trends
          </Link>
          <Link
            href={`/dashboard/students/${student.id}/view`}
            className="text-xs font-medium text-primary hover:underline"
          >
            View as student
          </Link>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {courseGrades.length > 0 ? (
          courseGrades.map((course) => (
            <CompactCourseGrade
              key={course.courseExternalId}
              course={course}
              studentId={student.id}
              displayMode={displayMode}
            />
          ))
        ) : (
          <Link
            href={`/dashboard/students/${student.id}/grades`}
            className="text-xs text-muted-foreground hover:text-primary hover:underline"
          >
            No grades yet
          </Link>
        )}
      </div>
    </article>
  );
}
