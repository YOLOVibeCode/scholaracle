'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { studentsApi, type IWorkflowAssignment } from '@/lib/api/students';
import { useAsyncData } from '@/lib/hooks';
import { LoadingSkeleton } from '@/components/common';
import { ErrorDisplay } from '@/components/common/ErrorDisplay';
import { AssignmentWorkflowTable } from '@/components/dashboard/students/AssignmentWorkflowTable';
import { WorkflowFilterBar, type WorkflowFilters } from '@/components/dashboard/students/WorkflowFilterBar';
import { AssignmentWorkflowDetail } from '@/components/dashboard/students/AssignmentWorkflowDetail';

function filterAssignments(
  assignments: readonly IWorkflowAssignment[],
  filters: WorkflowFilters
): IWorkflowAssignment[] {
  return assignments.filter((a) => {
    if (filters.courseExternalId != null && a.courseExternalId !== filters.courseExternalId)
      return false;
    if (filters.statuses.length > 0) {
      const hasUpcoming = filters.statuses.includes('upcoming');
      const hasOther = filters.statuses.some((s) => s !== 'upcoming');
      const matchUpcoming = hasUpcoming && a.isUpcoming;
      const matchStatus = hasOther && filters.statuses.includes(a.status);
      if (!matchUpcoming && !matchStatus) return false;
    }
    if (filters.category != null && a.category !== filters.category) return false;
    if (filters.from != null && a.dueAt != null && new Date(a.dueAt) < new Date(filters.from))
      return false;
    if (filters.to != null && a.dueAt != null && new Date(a.dueAt) > new Date(filters.to))
      return false;
    return true;
  });
}

export default function StudentWorkflowPage() {
  const params = useParams();
  const studentId = params.id as string;

  const { data, isLoading, error, retry, refresh } = useAsyncData(
    () => studentsApi.getAssignmentWorkflow(studentId),
    { retryCount: 1 }
  );

  const [filters, setFilters] = useState<WorkflowFilters>({
    courseExternalId: null,
    statuses: [],
    category: null,
    from: null,
    to: null,
  });
  const [detailAssignment, setDetailAssignment] = useState<IWorkflowAssignment | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const assignments = useMemo(() => data?.assignments ?? [], [data?.assignments]);
  const filtered = useMemo(
    () => filterAssignments(assignments, filters),
    [assignments, filters]
  );

  useEffect(() => {
    void refresh();
  }, [studentId, refresh]);

  const handleAssignmentClick = useCallback((a: IWorkflowAssignment) => {
    setDetailAssignment(a);
    setDetailOpen(true);
  }, []);

  const handleNoteSaved = useCallback(() => {
    void refresh();
  }, [refresh]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-4" data-testid="workflow-page-loading">
        <LoadingSkeleton variant="list" count={5} className="space-y-2" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 p-4" data-testid="workflow-page-error">
        <ErrorDisplay error={error} title="Assignment workflow" onRetry={retry} />
        <Button variant="outline" asChild>
          <Link href={`/dashboard/students/${studentId}`}>Back to student</Link>
        </Button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground">No workflow data.</p>
        <Button variant="outline" asChild>
          <Link href={`/dashboard/students/${studentId}`}>Back to student</Link>
        </Button>
      </div>
    );
  }

  const summary = data.summary;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4" data-testid="student-workflow-page">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/dashboard/students/${studentId}`} data-testid="workflow-back-link">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {data.studentName} — Assignment workflow
          </h1>
          <p className="text-muted-foreground text-sm">
            All assignments across courses. Click a row to see details and grade history.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-3">
        <span className="text-sm font-medium">Summary:</span>
        <button
          type="button"
          className="text-sm text-muted-foreground hover:underline"
          onClick={() => setFilters((f) => ({ ...f, statuses: [] }))}
        >
          All ({summary.total})
        </button>
        <button
          type="button"
          className="text-sm text-red-600 hover:underline dark:text-red-400"
          onClick={() =>
            setFilters((f) => ({ ...f, statuses: ['missing'] }))
          }
        >
          Missing ({summary.missing})
        </button>
        <button
          type="button"
          className="text-sm text-amber-600 hover:underline dark:text-amber-400"
          onClick={() => setFilters((f) => ({ ...f, statuses: ['late'] }))}
        >
          Late ({summary.late})
        </button>
        <button
          type="button"
          className="text-sm text-emerald-600 hover:underline dark:text-emerald-400"
          onClick={() => setFilters((f) => ({ ...f, statuses: ['graded'] }))}
        >
          Graded ({summary.graded})
        </button>
        <button
          type="button"
          className="text-sm text-sky-600 hover:underline dark:text-sky-400"
          onClick={() => setFilters((f) => ({ ...f, statuses: ['upcoming'] }))}
        >
          Upcoming ({summary.upcoming})
        </button>
      </div>

      <WorkflowFilterBar
        assignments={assignments}
        filters={filters}
        onFiltersChange={setFilters}
      />

      <div className="min-h-0 flex-1">
        <AssignmentWorkflowTable
          assignments={filtered}
          onAssignmentClick={handleAssignmentClick}
        />
      </div>

      <AssignmentWorkflowDetail
        open={detailOpen}
        onOpenChange={setDetailOpen}
        studentId={studentId}
        studentName={data.studentName}
        assignment={detailAssignment}
        onNoteSaved={handleNoteSaved}
      />
    </div>
  );
}
