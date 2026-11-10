/**
 * Alert kinds an adult can pick for a student (values match `AlertType` in @scholaracle/contracts;
 * the contacts API stores them as strings). An absent `alertTypes` means every kind.
 */
export const ALERT_TYPE_OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  { value: 'missing_assignment', label: 'Missing assignments' },
  { value: 'deadline', label: 'Upcoming deadlines' },
  { value: 'grade_drop', label: 'Grade drops' },
  { value: 'test', label: 'Tests' },
  { value: 'workload', label: 'Heavy workload' },
  { value: 'positive', label: 'Good news' },
  { value: 'recommendation', label: 'Recommendations' },
];
