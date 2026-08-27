import type { OpenTaskKind } from '@scholaracle/interfaces';

const DUE_SOON_MS = 72 * 60 * 60 * 1000;

const CLOSED_STATUSES = new Set(['submitted', 'graded', 'excused']);

/**
 * Map an LMS assignment into a studio open-task kind.
 * Missing/late always beat the due-soon window (TodayGuide sorts after this).
 */
export function classifyOpenTask(
  status: string,
  dueAt: Date | undefined,
  now: Date
): OpenTaskKind | null {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'missing' || normalized === 'late') return 'missing';
  if (CLOSED_STATUSES.has(normalized)) return null;
  if (dueAt === undefined) return null;
  const delta = dueAt.getTime() - now.getTime();
  if (delta >= 0 && delta <= DUE_SOON_MS) return 'due_soon';
  return null;
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
