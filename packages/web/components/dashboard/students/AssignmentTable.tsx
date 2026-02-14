'use client';

import type { ICourseAssignment, AssignmentStatus } from '@/lib/api/students';

export interface AssignmentTableProps {
  assignments: readonly ICourseAssignment[];
  courseName: string;
}

function statusBadgeClass(status: AssignmentStatus): string {
  switch (status) {
    case 'graded':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200';
    case 'submitted':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200';
    case 'missing':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200';
    case 'late':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function formatDueDate(dueAt: string | undefined): string {
  if (!dueAt) return '—';
  const d = new Date(dueAt);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function scoreText(a: ICourseAssignment): string {
  if (a.pointsPossible != null && a.pointsPossible > 0) {
    const earned = a.pointsEarned ?? 0;
    return `${earned}/${a.pointsPossible}`;
  }
  return '—';
}

function percentText(a: ICourseAssignment): string {
  if (a.pointsPossible != null && a.pointsPossible > 0 && a.pointsEarned != null) {
    const pct = Math.round((a.pointsEarned / a.pointsPossible) * 1000) / 10;
    return `${pct}%`;
  }
  return '—';
}

export function AssignmentTable({ assignments, courseName }: AssignmentTableProps) {
  if (assignments.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/20 p-6 text-center text-muted-foreground" data-testid="assignment-table-empty">
        No assignments for {courseName}.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card" data-testid="assignment-table">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left font-medium">Title</th>
              <th className="px-4 py-3 text-left font-medium">Due date</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Score</th>
              <th className="px-4 py-3 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr
                key={a.externalId}
                className={`border-b last:border-b-0 ${a.status === 'missing' || a.isOverdue ? 'bg-red-50/50 dark:bg-red-950/20' : ''}`}
              >
                <td className="px-4 py-2 font-medium">{a.title}</td>
                <td className="px-4 py-2 text-muted-foreground">{formatDueDate(a.dueAt)}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(a.status)}`}>
                    {a.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{scoreText(a)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{percentText(a)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
