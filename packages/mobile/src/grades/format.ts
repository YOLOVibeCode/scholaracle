/**
 * Pure formatting helpers shared by the grades screens (Dashboard,
 * CourseDetail, AssignmentDetail).
 *
 * UI-free on purpose: the node-env jest harness never loads screens, so any
 * logic that needs tests lives here.
 */

/**
 * Format an ISO date as e.g. 'Mar 15, 2026'. Unparseable input is returned
 * as-is (new Date never throws — it yields Invalid Date, which
 * toLocaleDateString would happily render as the string 'Invalid Date').
 */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Badge color for an assignment status (matches the app palette). */
export function statusColor(status?: string): { color: string } {
  switch (status) {
    case 'missing':
      return { color: '#dc3545' };
    case 'late':
      return { color: '#fd7e14' };
    case 'graded':
      return { color: '#28a745' };
    case 'submitted':
      return { color: '#4361ee' };
    default:
      return { color: '#6c757d' };
  }
}

/**
 * '9/10'-style points display. Null when there is nothing meaningful to show
 * (pointsPossible missing or 0). A missing earned value renders as '–' so an
 * ungraded assignment still shows what it is out of.
 */
export function formatPoints(earned?: number, possible?: number): string | null {
  if (possible == null || Number.isNaN(possible) || possible === 0) return null;
  const earnedText = earned != null && !Number.isNaN(earned) ? `${earned}` : '–';
  return `${earnedText}/${possible}`;
}

/** '90.0%'-style percentage. Null when either side is missing or possible is 0. */
export function formatPercent(earned?: number, possible?: number): string | null {
  if (earned == null || Number.isNaN(earned)) return null;
  if (possible == null || Number.isNaN(possible) || possible === 0) return null;
  return `${((earned / possible) * 100).toFixed(1)}%`;
}
