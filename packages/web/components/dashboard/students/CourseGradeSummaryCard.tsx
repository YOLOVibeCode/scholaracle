'use client';

import Link from 'next/link';
import type { ICourseGrade, ICourseAssignment } from '@/lib/api/students';
import { GradeTrendChart } from './GradeTrendChart';
import { gradeTextColor } from '@/lib/grade-colors';

export interface CourseGradeSummaryCardProps {
  course: ICourseGrade;
  studentId?: string;
}

function riskBadgeClass(riskLevel: string): string {
  switch (riskLevel) {
    case 'critical':
    case 'high':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200';
    case 'medium':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
    case 'low':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function formatDueDate(dueAt: string | undefined): string {
  if (!dueAt) return '—';
  return new Date(dueAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Sort assignments by impact: missing first, then late, then by lowest score. */
function sortByImpact(assignments: readonly ICourseAssignment[]): ICourseAssignment[] {
  const list = [...assignments];
  return list.sort((a, b) => {
    if (a.status === 'missing' && b.status !== 'missing') return -1;
    if (a.status !== 'missing' && b.status === 'missing') return 1;
    if (a.status === 'late' && b.status !== 'late') return -1;
    if (a.status !== 'late' && b.status === 'late') return 1;
    const scoreA =
      a.pointsPossible != null && a.pointsPossible > 0 && a.pointsEarned != null
        ? a.pointsEarned / a.pointsPossible
        : 1;
    const scoreB =
      b.pointsPossible != null && b.pointsPossible > 0 && b.pointsEarned != null
        ? b.pointsEarned / b.pointsPossible
        : 1;
    return scoreA - scoreB;
  });
}

function scoreText(a: ICourseAssignment): string {
  if (a.pointsPossible != null && a.pointsPossible > 0) {
    const earned = a.pointsEarned ?? 0;
    return `${earned}/${a.pointsPossible}`;
  }
  return '—';
}

export function CourseGradeSummaryCard({ course, studentId }: CourseGradeSummaryCardProps) {
  const trendLabel =
    course.recentTrend === 'improving'
      ? 'Improving'
      : course.recentTrend === 'declining'
        ? 'Declining'
        : 'Stable';
  const factors = sortByImpact(course.assignments);

  return (
    <div className="space-y-4" data-testid="course-grade-summary-card">
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold">{course.courseName}</h2>
        <div className="flex flex-wrap items-baseline gap-4">
          <span
            className={`text-3xl font-bold tabular-nums ${gradeTextColor(course.grade)}`}
            data-testid="course-letter-grade"
          >
            {course.letterGrade}
          </span>
          <span className="text-muted-foreground">
            <span className="tabular-nums">{course.grade}%</span>
            <span className="ml-2 text-sm">· {trendLabel}</span>
          </span>
          {course.riskLevel !== 'none' && (
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${riskBadgeClass(course.riskLevel)}`}
              data-testid="course-risk-badge"
            >
              {course.riskLevel} risk
            </span>
          )}
          {studentId && course.materialCount != null && course.materialCount > 0 && (
            <Link
              href={`/dashboard/students/${studentId}?tab=documents&course=${encodeURIComponent(course.courseExternalId)}`}
              className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              data-testid="view-materials-link"
            >
              {course.materialCount} material{course.materialCount !== 1 ? 's' : ''}
            </Link>
          )}
        </div>
      </div>

      {studentId && (
        <GradeTrendChart
          studentId={studentId}
          courseExternalId={course.courseExternalId}
          courseName={course.courseName}
        />
      )}

      <div className="rounded-lg border bg-card p-4" data-testid="why-this-grade">
        <h3 className="mb-2 font-semibold">Why this grade?</h3>
        {course.riskExplanation && (
          <p className="mb-3 text-sm text-muted-foreground">{course.riskExplanation}</p>
        )}
        {factors.length > 0 ? (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              Factors affecting this grade (most impactful first). Data may be combined from multiple
              sources (e.g. grade book and Google Classroom).
            </p>
            <ul className="space-y-2 text-sm">
              {factors.map((a) => (
                <li
                  key={a.externalId}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded border px-3 py-2 ${
                    a.status === 'missing' || a.isOverdue
                      ? 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20'
                      : 'border-muted bg-muted/20'
                  }`}
                >
                  <span className="font-medium">{a.title}</span>
                  <span className="text-muted-foreground">Due: {formatDueDate(a.dueAt)}</span>
                  <span
                    className={
                      a.status === 'missing'
                        ? 'text-red-600 dark:text-red-400'
                        : a.status === 'late'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-muted-foreground'
                    }
                  >
                    {a.status}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{scoreText(a)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No assignment-level data available for this course yet.
          </p>
        )}
      </div>
    </div>
  );
}
