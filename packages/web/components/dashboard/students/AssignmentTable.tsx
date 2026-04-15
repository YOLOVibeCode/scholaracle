'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { ICourseAssignment, IAttachment, AssignmentStatus } from '@/lib/api/students';
import { DataTable } from '@/components/ui/data-table';
import { Paperclip } from 'lucide-react';
import { AttachmentPreviewDialog } from './AttachmentPreviewDialog';

export interface AssignmentTableProps {
  assignments: readonly ICourseAssignment[];
  courseName: string;
  /** When set, rows are clickable and open the assignment detail drawer. */
  onAssignmentClick?: (assignment: ICourseAssignment) => void;
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

export function AssignmentTable({ assignments, courseName, onAssignmentClick }: AssignmentTableProps) {
  const [dialogAttachments, setDialogAttachments] = useState<readonly IAttachment[]>([]);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const openAttachments = (title: string, attachments: readonly IAttachment[]) => {
    setDialogTitle(title);
    setDialogAttachments(attachments);
    setDialogOpen(true);
  };

  const categories = useMemo(() => {
    const seen = new Map<string, number>();
    for (const a of assignments) {
      if (a.category) {
        seen.set(a.category, (seen.get(a.category) ?? 0) + 1);
      }
    }
    return Array.from(seen.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => {
        const weight = assignments.find((a) => a.category === name && a.categoryWeight != null)?.categoryWeight;
        return { name, count, weight };
      });
  }, [assignments]);

  const hasCategories = categories.length > 0;

  const filteredAssignments = useMemo(() => {
    if (!selectedCategory) return assignments;
    return assignments.filter((a) => a.category === selectedCategory);
  }, [assignments, selectedCategory]);

  const columns: ColumnDef<ICourseAssignment, unknown>[] = useMemo(
    () => [
      { accessorKey: 'title', header: 'Title', cell: ({ row }) => <span className="font-medium">{row.original.title}</span> },
      ...(hasCategories
        ? [
            {
              accessorKey: 'category' as const,
              header: 'Category',
              cell: ({ row }: { row: { original: ICourseAssignment } }) => {
                const cat = row.original.category;
                if (!cat) return <span className="text-muted-foreground">—</span>;
                return (
                  <span className="inline-flex items-center gap-1">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {cat}
                    </span>
                    {row.original.categoryWeight != null && (
                      <span className="text-[10px] text-muted-foreground/70">
                        {row.original.categoryWeight}%
                      </span>
                    )}
                  </span>
                );
              },
            },
          ]
        : []),
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
      {
        id: 'attachments',
        header: '',
        cell: ({ row }) => {
          const atts = row.original.attachments;
          if (!atts || atts.length === 0) return null;
          return (
            <button
              type="button"
              className="relative inline-flex items-center rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={`${atts.length} attachment${atts.length !== 1 ? 's' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                openAttachments(row.original.title, atts);
              }}
            >
              <Paperclip className="h-4 w-4" />
              {atts.length > 1 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {atts.length}
                </span>
              )}
            </button>
          );
        },
        size: 40,
      },
    ],
     
    [hasCategories],
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
      {hasCategories && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5" data-testid="category-filter">
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              selectedCategory === null
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            All ({assignments.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.name}
              type="button"
              onClick={() => setSelectedCategory(selectedCategory === cat.name ? null : cat.name)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedCategory === cat.name
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              {cat.name}
              {cat.weight != null && <span className="ml-0.5 opacity-70">({cat.weight}%)</span>}
              <span className="ml-1 opacity-60">{cat.count}</span>
            </button>
          ))}
        </div>
      )}

      <DataTable
        columns={columns}
        data={filteredAssignments}
        sorting
        getRowProps={(row) => ({
          className: [
            row.original.status === 'missing' || row.original.isOverdue ? 'bg-red-50/50 dark:bg-red-950/20' : undefined,
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

      <AttachmentPreviewDialog
        attachments={dialogAttachments}
        assignmentTitle={dialogTitle}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
