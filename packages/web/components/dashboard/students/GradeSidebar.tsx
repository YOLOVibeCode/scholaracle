'use client';

import type { ICourseGrade, RiskLevel } from '@/lib/api/students';

export interface GradeSidebarProps {
  courseGrades: readonly ICourseGrade[];
  selectedCourseId?: string | null;
  onSelectCourse?: (courseExternalId: string) => void;
  /** When true, render as compact strip for use on student detail; when false, for drill-down page. */
  compact?: boolean;
}

function gradeColorClass(grade: number, riskLevel: RiskLevel): string {
  if (grade >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (grade >= 70) return 'text-amber-600 dark:text-amber-400';
  if (grade >= 60) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

function borderRiskClass(riskLevel: RiskLevel): string {
  if (riskLevel === 'critical' || riskLevel === 'high') return 'border-l-4 border-l-amber-500 dark:border-l-amber-400';
  if (riskLevel === 'medium') return 'border-l-4 border-l-amber-400/70 dark:border-l-amber-500/70';
  return 'border-l-4 border-l-transparent';
}

export function GradeSidebar({
  courseGrades,
  selectedCourseId,
  onSelectCourse,
  compact = false,
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
