/**
 * Types of alerts that can trigger notifications.
 */
export enum AlertType {
  MISSING_ASSIGNMENT = 'missing_assignment',
  DEADLINE = 'deadline',
  GRADE_DROP = 'grade_drop',
  TEST = 'test',
  WORKLOAD = 'workload',
  POSITIVE = 'positive',
  RECOMMENDATION = 'recommendation',
  /** A student tapped "Need help" on an assignment. Parent-only (student review spec §3.2). */
  STUDENT_NEEDS_HELP = 'student_needs_help',
}

/**
 * Human copy for each alert type (settings toggles, inboxes). Exhaustive: adding an
 * AlertType without a label is a compile error.
 */
export const ALERT_TYPE_LABELS: Readonly<Record<AlertType, string>> = {
  [AlertType.MISSING_ASSIGNMENT]: 'Missing assignments',
  [AlertType.DEADLINE]: 'Upcoming deadlines',
  [AlertType.GRADE_DROP]: 'Grade drops',
  [AlertType.TEST]: 'Tests and quizzes',
  [AlertType.WORKLOAD]: 'Heavy workload',
  [AlertType.POSITIVE]: 'Good news',
  [AlertType.RECOMMENDATION]: 'Study recommendations',
  [AlertType.STUDENT_NEEDS_HELP]: 'Asks for help',
};

/** Label for an alert type string; unknown values fall back to spaced words. */
export function alertTypeLabel(type: string): string {
  const known = (ALERT_TYPE_LABELS as Readonly<Record<string, string>>)[type];
  return known ?? type.replace(/[_-]+/g, ' ').trim();
}
