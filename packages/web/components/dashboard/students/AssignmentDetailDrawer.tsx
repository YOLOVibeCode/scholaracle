'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Download,
} from 'lucide-react';
import { studentsApi, type ICourseMaterial, type IAttachment } from '@/lib/api/students';
import { getAttachmentIcon, getFileExtension } from '@/lib/attachment-utils';
import type { IStudentMaterialsResponse, IWorkPackView } from '@scholaracle/contracts';
import {
  WorkPack,
  createStaticWorkPackSource,
  humanAssignmentStatus,
} from '@scholaracle/studio-core';
import { WorkPackView } from '@/components/studio/WorkPackView';

export interface AssignmentDetailDrawerAssignment {
  readonly externalId: string;
  readonly title: string;
  readonly dueAt?: string;
  readonly status: string;
  readonly pointsPossible?: number;
  readonly pointsEarned?: number;
  readonly attachments?: readonly IAttachment[];
  /** Assignment instructions HTML from the LMS. */
  readonly description?: string;
  /** Direct link to the assignment on the school portal. */
  readonly lmsUrl?: string;
}

export interface AssignmentDetailDrawerCourse {
  readonly externalId: string;
  readonly name: string;
  readonly currentGrade?: number;
  readonly letterGrade?: string;
  readonly riskLevel?: string;
}

export interface AssignmentDetailDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly studentId: string;
  readonly studentName?: string;
  readonly assignment: AssignmentDetailDrawerAssignment | null;
  readonly course: AssignmentDetailDrawerCourse | null;
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

function riskBadgeClass(riskLevel?: string): string {
  if (riskLevel === 'high' || riskLevel === 'critical')
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200';
  if (riskLevel === 'medium') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
  return 'bg-muted text-muted-foreground';
}

function formatDueDate(dueAt: string | undefined): string {
  if (!dueAt) return '—';
  return new Date(dueAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function scoreText(a: AssignmentDetailDrawerAssignment): string {
  if (a.pointsPossible != null && a.pointsPossible > 0) {
    const earned = a.pointsEarned ?? 0;
    return `${earned} / ${a.pointsPossible}`;
  }
  return '—';
}

export function AssignmentDetailDrawer({
  open,
  onOpenChange,
  studentId,
  studentName,
  assignment,
  course,
}: AssignmentDetailDrawerProps) {
  const [pack, setPack] = useState<IWorkPackView | null>(null);
  const [loading, setLoading] = useState(false);

  const loadMaterials = useCallback(async () => {
    if (!studentId || !assignment?.externalId) {
      setPack(null);
      return;
    }
    setLoading(true);
    try {
      const res = await studentsApi.getMaterials(studentId, {
        assignmentExternalId: assignment.externalId,
      });
      const list = res?.courses?.flatMap((c) => c.materials) ?? [];
      const view = await new WorkPack(
        createStaticWorkPackSource({
          assignment: {
            assignmentExternalId: assignment.externalId,
            title: assignment.title,
            courseName: course?.name ?? '',
            status: assignment.status,
            ...(assignment.dueAt !== undefined ? { dueAt: assignment.dueAt } : {}),
            ...(assignment.description !== undefined
              ? { descriptionHtml: assignment.description }
              : {}),
            ...(assignment.lmsUrl !== undefined ? { lmsUrl: assignment.lmsUrl } : {}),
          },
          materials: toMaterialsResponse(
            studentId,
            course?.externalId ?? '',
            course?.name ?? '',
            list
          ),
        })
      ).load(
        {
          studentId,
          displayName: studentName ?? 'Student',
          showGrades: true,
        },
        assignment.externalId
      );
      setPack(view);
    } finally {
      setLoading(false);
    }
  }, [
    studentId,
    studentName,
    assignment?.externalId,
    assignment?.title,
    assignment?.status,
    assignment?.dueAt,
    assignment?.description,
    assignment?.lmsUrl,
    course?.externalId,
    course?.name,
  ]);

  useEffect(() => {
    if (open && assignment) void loadMaterials();
  }, [open, assignment, loadMaterials]);

  if (!assignment) return null;

  const gradeLabel =
    course?.currentGrade != null ? `${course.currentGrade}%` : course?.letterGrade ?? '—';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="pr-8">{assignment.title}</SheetTitle>
          <SheetDescription>
            Due {formatDueDate(assignment.dueAt)} ·{' '}
            <span
              className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(assignment.status)}`}
            >
              {humanAssignmentStatus(assignment.status)}
            </span>
            {assignment.pointsPossible != null && assignment.pointsPossible > 0 && (
              <> · {scoreText(assignment)}</>
            )}
          </SheetDescription>
        </SheetHeader>

        {course && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
            <span className="font-medium">{course.name}</span>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${riskBadgeClass(course.riskLevel)}`}
            >
              {gradeLabel}
            </span>
            {course.riskLevel && course.riskLevel !== 'none' && (
              <span className="text-xs text-muted-foreground capitalize">
                {course.riskLevel} risk
              </span>
            )}
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-4 overflow-auto">
          {assignment.attachments && assignment.attachments.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Student submissions</h3>
              <ul className="space-y-1">
                {assignment.attachments.map((att, i) => (
                  <li key={`${att.name}-${i}`}>
                    <AttachmentRow attachment={att} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading materials…</p>
          ) : pack ? (
            <WorkPackView view={pack} chrome="stack" className="mx-0 max-w-none px-0 py-2" />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function toMaterialsResponse(
  studentId: string,
  courseExternalId: string,
  courseName: string,
  materials: readonly ICourseMaterial[]
): IStudentMaterialsResponse {
  return {
    studentId,
    studentName: '',
    totalMaterials: materials.length,
    courses: [
      {
        courseExternalId,
        courseName,
        materials: materials.map((m) => ({
          externalId: m.externalId,
          title: m.title,
          type: m.type,
          assignmentExternalId: m.assignmentExternalId ?? null,
          ...(m.url !== undefined ? { url: m.url } : {}),
          ...(m.fileName !== undefined ? { fileName: m.fileName } : {}),
          ...(m.mimeType !== undefined ? { mimeType: m.mimeType } : {}),
          ...(m.postedAt !== undefined ? { postedAt: m.postedAt } : {}),
          ...(m.description !== undefined ? { description: m.description } : {}),
          ...(m.fileSize !== undefined ? { fileSize: m.fileSize } : {}),
          ...(m.assetId !== undefined ? { assetId: m.assetId } : {}),
          ...(m.contentHash !== undefined ? { contentHash: m.contentHash } : {}),
          ...(m.downloadUrl !== undefined ? { downloadUrl: m.downloadUrl } : {}),
          ...(m.linkAccessibility !== undefined
            ? { linkAccessibility: m.linkAccessibility }
            : {}),
        })),
      },
    ],
  };
}

function AttachmentRow({ attachment }: { attachment: IAttachment }) {
  const icon = getAttachmentIcon(attachment.type);
  const ext = getFileExtension(attachment.name);

  return (
    <div
      className="flex items-center gap-3 rounded-md border bg-background px-3 py-2"
      data-testid="drawer-attachment-row"
    >
      {React.createElement(icon, { className: "h-4 w-4 shrink-0 text-muted-foreground" })}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{attachment.name}</p>
        {ext && <p className="text-xs text-muted-foreground">{ext}</p>}
      </div>
      {attachment.url && (
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Download"
        >
          <Download className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}
