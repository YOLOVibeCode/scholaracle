import type { ISlcCourse } from '../models/Ingest';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type IClassMeetingFields = Pick<
  ISlcCourse,
  'startTime' | 'endTime' | 'daysOfWeek' | 'period'
>;

/** Format scraped class meeting fields for parent display (excludes tutorial). */
export function formatClassMeetingSummary(fields: IClassMeetingFields): string | undefined {
  const parts: string[] = [];
  if (fields.period?.trim()) {
    parts.push(`Period ${fields.period.trim()}`);
  }
  if (fields.daysOfWeek && fields.daysOfWeek.length > 0) {
    const labels = fields.daysOfWeek
      .filter((d) => d >= 0 && d <= 6)
      .map((d) => DAY_LABELS[d] ?? String(d));
    if (labels.length > 0) {
      parts.push(labels.join('/'));
    }
  }
  const start = fields.startTime?.trim();
  const end = fields.endTime?.trim();
  if (start && end) {
    parts.push(`${start}–${end}`);
  } else if (start) {
    parts.push(start);
  }
  const summary = parts.join(' · ').trim();
  return summary.length > 0 ? summary : undefined;
}
