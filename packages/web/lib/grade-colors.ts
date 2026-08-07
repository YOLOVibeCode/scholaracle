import type { RiskLevel } from '@/lib/api/students';

/** Tailwind bg-color class for a numeric grade (progress bars, badges). */
export function gradeBarColor(grade: number): string {
  if (grade >= 80) return 'bg-emerald-500';
  if (grade >= 70) return 'bg-amber-500';
  if (grade >= 60) return 'bg-orange-500';
  return 'bg-red-500';
}

/** Tailwind text-color class for a numeric grade. */
export function gradeTextColor(grade: number): string {
  if (grade >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (grade >= 70) return 'text-amber-600 dark:text-amber-400';
  if (grade >= 60) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

/** Combined text + border color class based on grade and optional risk level. */
export function gradeColorClass(grade: number, riskLevel?: RiskLevel): string {
  if (riskLevel === 'critical' || riskLevel === 'high' || grade < 60)
    return 'text-red-600 dark:text-red-400';
  if (grade >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (grade >= 70) return 'text-amber-600 dark:text-amber-400';
  if (grade >= 60) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

/** Hex color for a numeric grade (used by Recharts and canvas-based charts). */
export function gradeHexColor(grade: number): string {
  if (grade >= 80) return '#10b981';
  if (grade >= 70) return '#f59e0b';
  if (grade >= 60) return '#f97316';
  return '#ef4444';
}
