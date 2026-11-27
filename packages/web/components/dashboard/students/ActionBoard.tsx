'use client';

import { useEffect, useState } from 'react';
import { ApiClientError } from '@/lib/api/client';
import { studentsApi, type IActionItem } from '@/lib/api/students';
import { useAsyncData } from '@/lib/hooks';
import { LoadingSkeleton } from '@/components/common';
import { ErrorDisplay } from '@/components/common/ErrorDisplay';
import { ActionBucket, type INudgeError } from './ActionBucket';
import { AssignmentDetailDrawer } from './AssignmentDetailDrawer';

export interface ActionBoardProps {
  readonly studentId: string;
  /** When true, show only needs_attention and due_soon, limit to 3 items each. */
  readonly compact?: boolean;
}

const NUDGE_NOT_SENT = 'The nudge was not sent. Try again in a moment.';

/**
 * What to tell the parent when a nudge did not go out. A refusal (4xx) carries a line the
 * server wrote for them: the student has no login, the assignment was already nudged today,
 * only the account owner can nudge. Anything else is a fault on our side.
 */
export function nudgeFailureMessage(error: unknown): string {
  if (
    error instanceof ApiClientError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.message.trim() !== ''
  ) {
    return error.message;
  }
  return NUDGE_NOT_SENT;
}

export function ActionBoard({ studentId, compact = false }: ActionBoardProps) {
  const [drawerItem, setDrawerItem] = useState<IActionItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [nudgingId, setNudgingId] = useState<string | null>(null);
  const [nudgeError, setNudgeError] = useState<INudgeError | null>(null);
  const { data, isLoading, error, retry, refresh } = useAsyncData(
    () => studentsApi.getActionBoard(studentId),
    { retryCount: 1 }
  );

  const handleNudge = async (item: IActionItem): Promise<void> => {
    const assignmentExternalId = item.assignmentExternalId;
    setNudgeError(null);
    setNudgingId(assignmentExternalId);
    try {
      await studentsApi.nudge(studentId, assignmentExternalId);
    } catch (err) {
      // Nothing was sent: say so under the assignment and leave the board as it is, so it
      // never reads "Nudged" for a nudge nobody got.
      setNudgeError({ assignmentExternalId, message: nudgeFailureMessage(err) });
      return;
    } finally {
      setNudgingId(null);
    }
    refresh();
  };

  useEffect(() => {
    void refresh();
  }, [studentId, refresh]);

  if (isLoading) {
    return (
      <div data-testid="action-board-loading">
        <LoadingSkeleton variant="list" count={3} className="space-y-2" />
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="action-board-error">
        <ErrorDisplay error={error} title="Action board" onRetry={retry} />
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="action-board-empty">
        No action board data.
      </p>
    );
  }

  let buckets = data.buckets;
  if (compact) {
    buckets = data.buckets
      .filter((b) => b.id === 'needs_attention' || b.id === 'due_soon')
      .map((b) => {
        const sliced = b.items.slice(0, 3);
        return { ...b, items: sliced, count: sliced.length };
      });
  }

  if (buckets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="action-board-empty">
        No items to show.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-4" data-testid="action-board">
        {buckets.map((bucket) => (
          <ActionBucket
            key={bucket.id}
            bucket={bucket}
            onNudge={(item) => {
              void handleNudge(item);
            }}
            nudgingId={nudgingId}
            nudgeError={nudgeError}
            onItemClick={(item) => {
              setDrawerItem(item);
              setDrawerOpen(true);
            }}
          />
        ))}
      </div>
      <AssignmentDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        studentId={studentId}
        studentName={data.studentName}
        assignment={
          drawerItem
            ? {
                externalId: drawerItem.assignmentExternalId,
                title: drawerItem.title,
                dueAt: drawerItem.dueAt,
                status: drawerItem.status,
                pointsPossible: drawerItem.pointsPossible,
                pointsEarned: drawerItem.pointsEarned,
              }
            : null
        }
        course={
          drawerItem
            ? {
                externalId: drawerItem.course.externalId,
                name: drawerItem.course.name,
                currentGrade: drawerItem.course.currentGrade,
                letterGrade: drawerItem.course.letterGrade,
                riskLevel: drawerItem.course.riskLevel,
              }
            : null
        }
      />
    </>
  );
}
