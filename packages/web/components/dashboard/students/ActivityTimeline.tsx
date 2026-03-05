'use client';

import {
  TrendingUp,
  TrendingDown,
  FileText,
  Trash2,
  AlertCircle,
  CheckCircle,
  MessageCircle,
  BarChart3,
  Plus,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { IActivityEvent } from '@/lib/api/students';

export interface ActivityTimelineProps {
  readonly events: readonly IActivityEvent[];
  readonly loading?: boolean;
  readonly emptyMessage?: string;
  readonly maxHeight?: string;
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffM = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMs / 3600_000);
  const diffD = Math.floor(diffMs / 86400_000);
  if (diffM < 1) return 'Just now';
  if (diffM < 60) return `${diffM}m ago`;
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function formatDateHeader(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayStart = new Date(d);
  dayStart.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - dayStart.getTime()) / 86400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

function iconAndColor(event: IActivityEvent): { Icon: ComponentType<{ className?: string }>; className: string } {
  switch (event.eventType) {
    case 'grade_change':
      if (event.severity === 'positive') return { Icon: TrendingUp, className: 'text-emerald-600 dark:text-emerald-400' };
      if (event.severity === 'negative') return { Icon: TrendingDown, className: 'text-red-600 dark:text-red-400' };
      return { Icon: BarChart3, className: 'text-muted-foreground' };
    case 'material_added':
      return { Icon: Plus, className: 'text-blue-600 dark:text-blue-400' };
    case 'material_removed':
      return { Icon: Trash2, className: 'text-muted-foreground' };
    case 'material_updated':
      return { Icon: FileText, className: 'text-blue-600 dark:text-blue-400' };
    case 'alert_created':
      if (event.severity === 'positive') return { Icon: CheckCircle, className: 'text-emerald-600 dark:text-emerald-400' };
      if (event.severity === 'negative') return { Icon: AlertCircle, className: 'text-red-600 dark:text-red-400' };
      return { Icon: AlertCircle, className: 'text-amber-600 dark:text-amber-400' };
    case 'comment_added':
      return { Icon: MessageCircle, className: 'text-violet-600 dark:text-violet-400' };
    case 'grade_snapshot':
      return { Icon: BarChart3, className: 'text-slate-600 dark:text-slate-400' };
    default:
      return { Icon: BarChart3, className: 'text-muted-foreground' };
  }
}

export function ActivityTimeline({
  events,
  loading,
  emptyMessage = 'No activity yet.',
  maxHeight,
}: ActivityTimelineProps) {
  if (loading) {
    return (
      <div className="space-y-2 py-2" data-testid="activity-timeline-loading">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground" data-testid="activity-timeline-empty">
        {emptyMessage}
      </p>
    );
  }

  const dateHeaders: (string | null)[] = [];
  let lastSeen = '';
  for (const event of events) {
    const date = event.occurredAt.split('T')[0]!;
    if (date !== lastSeen) {
      dateHeaders.push(date);
      lastSeen = date;
    } else {
      dateHeaders.push(null);
    }
  }

  const containerClass = maxHeight ? `overflow-y-auto` : '';

  return (
    <div
      className={`space-y-0 ${containerClass}`}
      style={maxHeight ? { maxHeight } : undefined}
      data-testid="activity-timeline"
    >
      <ul className="relative border-l-2 border-muted pl-0">
        {events.map((event, idx) => {
          const dateHeader = dateHeaders[idx];
          const { Icon, className: iconClass } = iconAndColor(event);
          return (
            <li key={event.id} className="relative flex gap-3 pb-4 pl-5">
              <span className="absolute left-0 -translate-x-1/2 rounded-full border-2 border-background bg-background">
                <Icon className={`h-4 w-4 ${iconClass}`} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                {dateHeader && (
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    {formatDateHeader(event.occurredAt)}
                  </p>
                )}
                <p className="text-sm font-medium leading-tight">{event.title}</p>
                {event.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{event.description}</p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {relativeTime(event.occurredAt)}
                  {(event.courseName || event.assignmentTitle) && (
                    <span className="ml-2">
                      · {[event.courseName, event.assignmentTitle].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
