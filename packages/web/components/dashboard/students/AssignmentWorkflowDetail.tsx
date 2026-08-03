'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  FileText,
  Link2,
  BookOpen,
  FileSpreadsheet,
  Presentation,
  Video,
  File,
  Download,
  Lock,
  ExternalLink,
} from 'lucide-react';
import type { ComponentType } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  studentsApi,
  type IWorkflowAssignment,
  type ICourseMaterial,
  type StudentStatus,
} from '@/lib/api/students';
import { ActivityTimeline } from '@/components/dashboard/students/ActivityTimeline';
import { CommentThread } from '@/components/dashboard/students/CommentThread';

const MATERIAL_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  document: FileText,
  link: Link2,
  syllabus: BookOpen,
  handout: FileSpreadsheet,
  presentation: Presentation,
  video: Video,
};

export interface AssignmentWorkflowDetailProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly studentId: string;
  readonly studentName?: string;
  readonly assignment: IWorkflowAssignment | null;
  readonly onNoteSaved?: () => void;
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
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function formatDueDate(dueAt: string | undefined): string {
  if (!dueAt) return '—';
  return new Date(dueAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function scoreText(a: IWorkflowAssignment): string {
  if (a.pointsPossible != null && a.pointsPossible > 0) {
    const earned = a.pointsEarned ?? 0;
    return `${earned} / ${a.pointsPossible}`;
  }
  return '—';
}

export function AssignmentWorkflowDetail({
  open,
  onOpenChange,
  studentId,
  assignment,
  onNoteSaved,
}: AssignmentWorkflowDetailProps) {
  const [materials, setMaterials] = useState<readonly ICourseMaterial[]>([]);
  const [activityEvents, setActivityEvents] = useState<readonly import('@/lib/api/students').IActivityEvent[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [studentStatus, setStudentStatus] = useState<string>(assignment?.studentStatus ?? 'not_started');

  useEffect(() => {
    if (assignment) setStudentStatus(assignment.studentStatus ?? 'not_started');
  }, [assignment]);

  const handleStatusChange = async (value: string) => {
    if (!assignment) return;
    setStudentStatus(value);
    await studentsApi.updateAssignmentStatus(studentId, assignment.externalId, value as StudentStatus);
  };

  const loadMaterials = useCallback(async () => {
    if (!studentId || !assignment?.externalId) {
      setMaterials([]);
      return;
    }
    setLoadingMaterials(true);
    try {
      const res = await studentsApi.getMaterials(studentId, {
        assignmentExternalId: assignment.externalId,
      });
      const list = res?.courses?.flatMap((c) => c.materials) ?? [];
      setMaterials(list);
    } finally {
      setLoadingMaterials(false);
    }
  }, [studentId, assignment?.externalId]);

  const loadActivity = useCallback(async () => {
    if (!studentId || !assignment?.externalId) {
      setActivityEvents([]);
      return;
    }
    setLoadingActivity(true);
    try {
      const res = await studentsApi.getActivityTimeline(studentId, {
        assignment: assignment.externalId,
        limit: 50,
      });
      setActivityEvents(res?.events ?? []);
    } finally {
      setLoadingActivity(false);
    }
  }, [studentId, assignment?.externalId]);

  useEffect(() => {
    if (open && assignment) {
      void loadMaterials();
      void loadActivity();
    }
  }, [open, assignment, loadMaterials, loadActivity]);

  if (!assignment) return null;

  const gradeLabel =
    assignment.courseGrade != null
      ? `${assignment.courseGrade}%`
      : assignment.courseLetterGrade ?? '—';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-y-auto sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle className="pr-8">{assignment.title}</SheetTitle>
          <SheetDescription>
            Due {formatDueDate(assignment.dueAt)} ·{' '}
            <span
              className={`inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClass(assignment.status)}`}
            >
              {(assignment.status as string).replace('_', ' ')}
            </span>
            {assignment.pointsPossible != null &&
              assignment.pointsPossible > 0 && (
                <> · {scoreText(assignment)}</>
              )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
          <span className="font-medium">{assignment.courseName}</span>
          <span className="rounded px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
            {gradeLabel}
          </span>
        </div>

        <div className="flex items-center gap-3 rounded-lg border p-3">
          <span className="text-sm font-medium">Progress:</span>
          <Select value={studentStatus} onValueChange={(v) => void handleStatusChange(v)}>
            <SelectTrigger className="h-8 w-[160px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not_started">Not Started</SelectItem>
              <SelectItem value="working_on_it">Working On It</SelectItem>
              <SelectItem value="need_help">Need Help</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Activity</h3>
          <ActivityTimeline
            events={activityEvents}
            loading={loadingActivity}
            emptyMessage="No activity for this assignment yet."
            maxHeight="200px"
          />
        </div>

        <div className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">Comments</h3>
          <CommentThread
            studentId={studentId}
            assignmentExternalId={assignment.externalId}
            courseExternalId={assignment.courseExternalId}
            onCommentAdded={onNoteSaved}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">Related materials</h3>
          {loadingMaterials ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : materials.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No materials linked to this assignment.
            </p>
          ) : (
            <ul className="space-y-1">
              {materials.map((m) => (
                <MaterialRow key={m.externalId} material={m} />
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MaterialRow({ material }: { material: ICourseMaterial }) {
  const Icon = MATERIAL_ICONS[material.type] ?? File;
  const href = material.downloadUrl ?? material.url;

  return (
    <div
      className="flex items-center gap-3 rounded-md border bg-background px-3 py-2"
      data-testid="workflow-detail-material-row"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{material.title}</p>
        {material.fileName && (
          <p className="truncate text-xs text-muted-foreground">
            {material.fileName}
          </p>
        )}
      </div>
      {material.linkAccessibility === 'authenticated' && (
        <span title="Requires school login">
          <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </span>
      )}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title={material.downloadUrl ? 'Download' : 'Open link'}
        >
          {material.downloadUrl ? (
            <Download className="h-4 w-4" />
          ) : (
            <ExternalLink className="h-4 w-4" />
          )}
        </a>
      ) : null}
    </div>
  );
}
