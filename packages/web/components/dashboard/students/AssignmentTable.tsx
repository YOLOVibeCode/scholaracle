'use client';

import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { ICourseAssignment, AssignmentStatus } from '@/lib/api/students';
import { DataTable } from '@/components/ui/data-table';

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
  const columns: ColumnDef<ICourseAssignment, unknown>[] = useMemo(
    () => [
      { accessorKey: 'title', header: 'Title', cell: ({ row }) => <span className="font-medium">{row.original.title}</span> },
      { accessorKey: 'dueAt', header: 'Due date', cell: ({ row }) => <span className="text-muted-foreground">{formatDueDate(row.original.dueAt)}</span> },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(row.original.status)}`}>
            {row.original.status}
          </span>
        ),
      },
      {
        id: 'score',
        header: () => <div className="text-right">Score</div>,
        cell: ({ row }) => <div className="text-right tabular-nums">{scoreText(row.original)}</div>,
      },
      {
        id: 'percent',
        header: () => <div className="text-right">%</div>,
        cell: ({ row }) => <div className="text-right tabular-nums">{percentText(row.original)}</div>,
      },
    ],
    []
  );

  if (assignments.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/20 p-6 text-center text-muted-foreground" data-testid="assignment-table-empty">
        No assignments for {courseName}.
      </div>
    );
  }

  return (
    <div data-testid="assignment-table">
      <DataTable
        columns={columns}
        data={assignments}
        sorting
        getRowProps={(row) => ({
          className: row.original.status === 'missing' || row.original.isOverdue ? 'bg-red-50/50 dark:bg-red-950/20' : undefined,
        })}
      />
    </div>
  );
}
