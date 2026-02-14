'use client';

import Link from 'next/link';
import type { ICourseGrade, RiskLevel } from '@/lib/api/students';

export interface CourseGradeCardProps {
  studentId: string;
  course: ICourseGrade;
}

function gradeColorClass(grade: number, riskLevel: RiskLevel): string {
  if (grade >= 80) return 'text-emerald-600 dark:text-emerald-400 border-emerald-500/50';
  if (grade >= 70) return 'text-amber-600 dark:text-amber-400 border-amber-500/50';
  if (grade >= 60) return 'text-orange-600 dark:text-orange-400 border-orange-500/50';
  return 'text-red-600 dark:text-red-400 border-red-500/50';
}

export function CourseGradeCard({ studentId, course }: CourseGradeCardProps) {
  const isAtRisk = ['medium', 'high', 'critical'].includes(course.riskLevel);
  const colorClass = gradeColorClass(course.grade, course.riskLevel);
  const href = `/dashboard/students/${studentId}/grades?course=${encodeURIComponent(course.courseExternalId)}`;

  return (
    <Link
      href={href}
      className="block rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
      data-testid={`course-grade-card-${course.courseExternalId}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium">{course.courseName}</h3>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${colorClass}`}>{course.grade}%</div>
          <div className={`text-sm font-medium ${colorClass}`}>{course.letterGrade}</div>
        </div>
        {isAtRisk && (
          <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
            At risk
          </span>
        )}
      </div>
      {course.riskExplanation && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{course.riskExplanation}</p>
      )}
    </Link>
  );
}
