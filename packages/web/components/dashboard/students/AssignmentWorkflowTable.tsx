'use client';

import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { IWorkflowAssignment } from '@/lib/api/students';
import { DataTable } from '@/components/ui/data-table';

export interface AssignmentWorkflowTableProps {
  assignments: readonly IWorkflowAssignment[];
  onAssignmentClick?: (assignment: IWorkflowAssignment) => void;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'graded':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200';
    case 'submitted':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200';
    case 'missing':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200';
    case 'late':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
    case 'pending':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function categoryBadgeClass(category: string | undefined): string {
  if (category?.toLowerCase() === 'major')
    return 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-200';
  return 'bg-muted text-muted-foreground';
}

function formatDueDate(dueAt: string | undefined): string {
  if (!dueAt) return '—';
  const d = new Date(dueAt);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function scoreText(a: IWorkflowAssignment): string {
  if (a.pointsPossible != null && a.pointsPossible > 0) {
    const earned = a.pointsEarned ?? 0;
    return `${earned}/${a.pointsPossible}`;
  }
  return '—';
}

function percentText(a: IWorkflowAssignment): string {
  if (a.percentScore != null) return `${a.percentScore}%`;
  if (a.pointsPossible != null && a.pointsPossible > 0 && a.pointsEarned != null) {
    const pct = Math.round((a.pointsEarned / a.pointsPossible) * 1000) / 10;
    return `${pct}%`;
  }
  return '—';
}

function dueDateCellClassName(a: IWorkflowAssignment): string {
  if (a.isOverdue) return 'text-red-600 dark:text-red-400 font-medium';
  if (a.isUpcoming && a.dueAt) {
    const due = new Date(a.dueAt).getTime();
    const in72h = Date.now() + 72 * 60 * 60 * 1000;
    if (due <= in72h) return 'text-amber-600 dark:text-amber-400';
  }
  return 'text-muted-foreground';
}

export function AssignmentWorkflowTable({
  assignments,
  onAssignmentClick,
}: AssignmentWorkflowTableProps) {
  const columns: ColumnDef<IWorkflowAssignment, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'courseName',
        header: 'Subject',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.courseName}</span>
        ),
      },
      {
        accessorKey: 'dueAt',
        header: 'Due date',
        cell: ({ row }) => (
          <span className={dueDateCellClassName(row.original)}>
            {formatDueDate(row.original.dueAt)}
          </span>
        ),
      },
      {
        accessorKey: 'title',
        header: 'Assignment',
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      },
      {
        accessorKey: 'category',
        header: 'Category',
        cell: ({ row }) => {
          const cat = row.original.category ?? '—';
          return (
            <span
              className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${categoryBadgeClass(row.original.category)}`}
            >
              {cat}
            </span>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <span
            className={`inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClass(row.original.status)}`}
          >
            {(row.original.status as string).replace('_', ' ')}
          </span>
        ),
      },
      {
        id: 'score',
        header: () => <div className="text-right">Score</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">{scoreText(row.original)}</div>
        ),
      },
      {
        id: 'percent',
        header: () => <div className="text-right">%</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">{percentText(row.original)}</div>
        ),
      },
    ],
    []
  );

  if (assignments.length === 0) {
    return (
      <div
        className="rounded-lg border bg-muted/20 p-6 text-center text-muted-foreground"
        data-testid="assignment-workflow-table-empty"
      >
        No assignments to show.
      </div>
    );
  }

  return (
    <div data-testid="assignment-workflow-table">
      <DataTable
        columns={columns}
        data={assignments}
        sorting
        initialState={{
          sorting: [
            { id: 'dueAt', desc: false },
            { id: 'status', desc: false },
          ],
        }}
        getRowProps={(row) => ({
          className: [
            row.original.isMissing || row.original.isOverdue
              ? 'bg-red-50/50 dark:bg-red-950/20'
              : undefined,
            onAssignmentClick ? 'cursor-pointer hover:bg-muted/50' : undefined,
          ]
            .filter(Boolean)
            .join(' '),
          ...(onAssignmentClick && {
            onClick: () => onAssignmentClick(row.original),
            role: 'button',
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onAssignmentClick(row.original);
              }
            },
          }),
        })}
      />
    </div>
  );
}
