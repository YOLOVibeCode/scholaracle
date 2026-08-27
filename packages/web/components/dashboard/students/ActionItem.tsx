'use client';

import {
  ClipboardList,
  FileText,
  Presentation,
  Video,
  BookOpen,
  ExternalLink,
  FileIcon,
} from 'lucide-react';
import type { IActionItem, IActionAsset } from '@/lib/api/students';

export interface ActionItemProps {
  readonly item: IActionItem;
  readonly onItemClick?: (item: IActionItem) => void;
  readonly onNudge?: (item: IActionItem) => void;
  readonly nudging?: boolean;
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
    case 'in_progress':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function courseGradePillClass(riskLevel: string, currentGrade?: number): string {
  if (riskLevel === 'high' || riskLevel === 'critical') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200';
  if (riskLevel === 'medium') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
  if (currentGrade != null && currentGrade >= 80) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200';
  if (currentGrade != null && currentGrade >= 70) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
  return 'bg-muted text-muted-foreground';
}

function formatDueDate(dueAt: string | undefined): string {
  if (!dueAt) return '—';
  const d = new Date(dueAt);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatNudgedAgo(iso: string, now: Date = new Date()): string {
  const diffM = Math.max(1, Math.floor((now.getTime() - new Date(iso).getTime()) / 60000));
  if (diffM < 60) return `Nudged ${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `Nudged ${diffH}h ago`;
  return `Nudged ${Math.floor(diffH / 24)}d ago`;
}

export function nudgedToday(iso: string | undefined, now: Date = new Date()): boolean {
  if (iso === undefined || iso === '') return false;
  return new Date(iso).toDateString() === now.toDateString();
}

function AssetChipIcon({ materialType }: { materialType: string }) {
  const t = materialType.toLowerCase();
  if (t === 'rubric') return <ClipboardList className="h-3.5 w-3.5 shrink-0" />;
  if (t === 'syllabus') return <FileText className="h-3.5 w-3.5 shrink-0" />;
  if (t === 'presentation') return <Presentation className="h-3.5 w-3.5 shrink-0" />;
  if (t === 'video') return <Video className="h-3.5 w-3.5 shrink-0" />;
  if (t === 'study_guide') return <BookOpen className="h-3.5 w-3.5 shrink-0" />;
  if (t === 'link') return <ExternalLink className="h-3.5 w-3.5 shrink-0" />;
  return <FileIcon className="h-3.5 w-3.5 shrink-0" />;
}

function AssetChip({ asset }: { asset: IActionAsset }) {
  const label = asset.fileName || asset.materialType || 'File';
  return (
    <a
      href={asset.downloadUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
      title={label}
    >
      <AssetChipIcon materialType={asset.materialType} />
      <span className="max-w-[120px] truncate">{label}</span>
    </a>
  );
}

export function ActionItem({ item, onItemClick, onNudge, nudging = false }: ActionItemProps) {
  const gradeLabel =
    item.course.currentGrade != null
      ? `${item.course.currentGrade}%`
      : item.course.letterGrade ?? '—';
  const allAssets = [...item.assets, ...item.materials];
  const alreadyNudged = nudgedToday(item.lastNudgedAt);

  return (
    <div
      data-testid={`action-item-${item.assignmentExternalId}`}
      onClick={onItemClick ? () => onItemClick(item) : undefined}
      className={
        onItemClick
          ? 'flex w-full cursor-pointer flex-col gap-2 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50'
          : 'flex flex-col gap-2 rounded-lg border bg-card p-3'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{item.title}</p>
          <p className="text-sm text-muted-foreground">{formatDueDate(item.dueAt)}</p>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClass(item.status)}`}
        >
          {item.status.replace('_', ' ')}
        </span>
      </div>
      {item.studentStatus === 'working_on_it' ? (
        <p className="text-xs text-sky-700 dark:text-sky-300" data-testid="action-item-working">
          Working on it
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{item.course.name}</span>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${courseGradePillClass(item.course.riskLevel, item.course.currentGrade)}`}
        >
          {gradeLabel}
        </span>
      </div>
      {allAssets.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="action-item-assets">
          {allAssets.map((a) => (
            <AssetChip key={a.assetId} asset={a} />
          ))}
        </div>
      )}
      {onNudge ? (
        <div className="flex flex-wrap items-center gap-2">
          {item.lastNudgedAt ? (
            <span className="text-xs text-muted-foreground" data-testid="action-item-nudged">
              {formatNudgedAgo(item.lastNudgedAt)}
            </span>
          ) : null}
          <button
            type="button"
            data-testid="action-item-nudge"
            disabled={alreadyNudged || nudging}
            className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
            onClick={(event) => {
              event.stopPropagation();
              onNudge(item);
            }}
          >
            Nudge
          </button>
        </div>
      ) : null}
    </div>
  );
}
