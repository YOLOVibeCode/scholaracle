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
import { studentsApi, type ICourseMaterial } from '@/lib/api/students';

const MATERIAL_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  document: FileText,
  link: Link2,
  syllabus: BookOpen,
  handout: FileSpreadsheet,
  presentation: Presentation,
  video: Video,
};

export interface AssignmentDetailDrawerAssignment {
  readonly externalId: string;
  readonly title: string;
  readonly dueAt?: string;
  readonly status: string;
  readonly pointsPossible?: number;
  readonly pointsEarned?: number;
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
  assignment,
  course,
}: AssignmentDetailDrawerProps) {
  const [materials, setMaterials] = useState<readonly ICourseMaterial[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMaterials = useCallback(async () => {
    if (!studentId || !assignment?.externalId) {
      setMaterials([]);
      return;
    }
    setLoading(true);
    try {
      const res = await studentsApi.getMaterials(studentId, {
        assignmentExternalId: assignment.externalId,
      });
      const list = res?.courses?.flatMap((c) => c.materials) ?? [];
      setMaterials(list);
    } finally {
      setLoading(false);
    }
  }, [studentId, assignment?.externalId]);

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
              className={`inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClass(assignment.status)}`}
            >
              {assignment.status.replace('_', ' ')}
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

        <div className="min-w-0 flex-1 space-y-2 overflow-auto">
          <h3 className="text-sm font-semibold">Related materials</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : materials.length === 0 ? (
            <p className="text-sm text-muted-foreground">No materials linked to this assignment.</p>
          ) : (
            <ul className="space-y-1">
              {materials.map((m) => (
                <li key={m.externalId}>
                  <MaterialRow material={m} />
                </li>
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
  const isLink = material.type === 'link' || material.url;
  const href = material.downloadUrl ?? material.url;

  return (
    <div
      className="flex items-center gap-3 rounded-md border bg-background px-3 py-2"
      data-testid="drawer-material-row"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{material.title}</p>
        {material.fileName && (
          <p className="truncate text-xs text-muted-foreground">{material.fileName}</p>
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
