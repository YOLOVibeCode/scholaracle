/**
 * Parent- and student-facing English for assignment status tokens.
 * Never return the raw token (`missing`, `submitted`, …).
 */
export function humanAssignmentStatus(token: string): string {
  switch (token) {
    case 'missing':
      return 'Not turned in';
    case 'submitted':
      return 'Turned in';
    case 'graded':
      return 'Graded';
    case 'late':
      return 'Late';
    case 'working_on_it':
      return 'Working on it';
    default:
      return 'Not started';
  }
}
