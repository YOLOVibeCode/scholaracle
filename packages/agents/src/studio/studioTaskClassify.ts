import type { OpenTaskKind } from '@scholaracle/interfaces';

export const DUE_SOON_MS = 72 * 60 * 60 * 1000;

const CLOSED_STATUSES = new Set(['submitted', 'graded', 'excused']);

/** Portal says the work is finished (excused is not finished work). */
export const DONE_STATUSES = new Set(['submitted', 'graded']);

/** The one way a portal status token is compared anywhere in the studio adapters. */
export function normalizeStatus(status: unknown): string {
  return typeof status === 'string' ? status.trim().toLowerCase() : '';
}

/**
 * Map an LMS assignment into a studio open-task kind.
 * Missing/late always beat the due-soon window (TodayGuide sorts after this).
 * Past due but not flagged by the portal is `overdue`; due after the due-soon
 * window is `upcoming` with no horizon cut here — WeekGuide alone decides what
 * falls inside the seven local days. Today ignores `overdue` and `upcoming`.
 */
export function classifyOpenTask(
  status: string,
  dueAt: Date | undefined,
  now: Date
): OpenTaskKind | null {
  const normalized = normalizeStatus(status);
  if (normalized === 'missing' || normalized === 'late') return 'missing';
  if (CLOSED_STATUSES.has(normalized)) return null;
  if (dueAt === undefined) return null;
  const delta = dueAt.getTime() - now.getTime();
  if (delta < 0) return 'overdue';
  if (delta <= DUE_SOON_MS) return 'due_soon';
  return 'upcoming';
}

export function studioPrimaryCtaLabel(
  hasHostedFile: boolean,
  mimeType: string | undefined
): string {
  if (!hasHostedFile) return 'Open assignment';
  if (mimeType !== undefined && mimeType.startsWith('video/')) return 'Open video';
  if (mimeType !== undefined && mimeType.startsWith('image/')) return 'Open image';
  return 'Open worksheet';
}

export function toIsoDate(value: unknown): string | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (typeof value === 'string' && value !== '') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
  }
  return undefined;
}
