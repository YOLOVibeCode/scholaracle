'use client';

import type { ICourseGrade, RiskLevel } from '@/lib/api/students';
import { gradeColorClass as _gradeColorClass } from '@/lib/grade-colors';

export interface GradeSidebarProps {
  courseGrades: readonly ICourseGrade[];
  selectedCourseId?: string | null;
  onSelectCourse?: (courseExternalId: string) => void;
  /** When true, render as compact strip for use on student detail; when false, for drill-down page. */
  compact?: boolean;
}

/** @deprecated Import from \`@/lib/grade-colors\` directly. Kept for back-compat. */
export function gradeColorClass(grade: number, riskLevel: RiskLevel): string {
  return _gradeColorClass(grade, riskLevel);
}

export function borderRiskClass(riskLevel: RiskLevel): string {
  if (riskLevel === 'critical' || riskLevel === 'high') return 'border-l-4 border-l-amber-500 dark:border-l-amber-400';
  if (riskLevel === 'medium') return 'border-l-4 border-l-amber-400/70 dark:border-l-amber-500/70';
  return 'border-l-4 border-l-transparent';
}

export function riskBadgeClass(riskLevel: RiskLevel): string {
  if (riskLevel === 'critical') return 'bg-red-600 text-white dark:bg-red-500';
  if (riskLevel === 'high') return 'bg-amber-600 text-white dark:bg-amber-500';
  if (riskLevel === 'medium') return 'bg-amber-500/80 text-white dark:bg-amber-400/80';
  if (riskLevel === 'low') return 'bg-muted text-muted-foreground';
  return 'bg-muted/60 text-muted-foreground';
}

export function GradeSidebar({
  courseGrades,
  selectedCourseId,
  onSelectCourse,
  compact = false, // eslint-disable-line @typescript-eslint/no-unused-vars -- reserved for compact layout
}: GradeSidebarProps) {
  if (courseGrades.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground" data-testid="grade-sidebar-empty">
        No course grades yet.
      </div>
    );
  }

  return (
    <nav
      className="flex flex-col gap-1 overflow-y-auto rounded-lg border bg-muted/20 p-2"
      aria-label="Course grades"
      data-testid="grade-sidebar"
    >
      {courseGrades.map((course) => {
        const isSelected = selectedCourseId != null && selectedCourseId === course.courseExternalId;
        const isAtRisk = ['medium', 'high', 'critical'].includes(course.riskLevel);
        const colorClass = gradeColorClass(course.grade, course.riskLevel);
        const riskBorder = borderRiskClass(course.riskLevel);

        const content = (
          <>
            <div className="truncate text-xs font-medium text-muted-foreground" title={course.courseName}>
              {course.courseName}
            </div>
            <div className={`text-xl font-bold tabular-nums ${colorClass}`}>{course.grade}</div>
            <div className={`text-xs font-medium ${colorClass}`}>{course.letterGrade}</div>
            {course.materialCount != null && course.materialCount > 0 && (
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {course.materialCount} material{course.materialCount !== 1 ? 's' : ''}
              </div>
            )}
            {isAtRisk && (
              <span
                className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                aria-label="At risk"
              />
            )}
          </>
        );

        if (onSelectCourse) {
          return (
            <button
              type="button"
              key={course.courseExternalId}
              onClick={() => onSelectCourse(course.courseExternalId)}
              className={`flex w-full flex-col rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/50 ${riskBorder} ${
                isSelected ? 'bg-muted/60 ring-1 ring-primary' : ''
              }`}
              data-testid={`grade-sidebar-course-${course.courseExternalId}`}
              data-selected={isSelected || undefined}
            >
              {content}
            </button>
          );
        }

        return (
          <div
            key={course.courseExternalId}
            className={`flex w-full flex-col rounded-md px-2 py-2 ${riskBorder}`}
            data-testid={`grade-sidebar-course-${course.courseExternalId}`}
          >
            {content}
          </div>
        );
      })}
    </nav>
  );
}
