import { humanAssignmentStatus } from './humanAssignmentStatus';

describe('humanAssignmentStatus', () => {
  it('maps tokens to parent- and student-facing English', () => {
    expect(humanAssignmentStatus('missing')).toBe('Not turned in');
    expect(humanAssignmentStatus('submitted')).toBe('Turned in');
    expect(humanAssignmentStatus('graded')).toBe('Graded');
    expect(humanAssignmentStatus('late')).toBe('Late');
    expect(humanAssignmentStatus('working_on_it')).toBe('Working on it');
    expect(humanAssignmentStatus('unknown')).toBe('Not started');
    expect(humanAssignmentStatus('')).toBe('Not started');
  });

  it('never echoes the raw token', () => {
    for (const token of ['missing', 'submitted', 'graded', 'late', 'unknown', 'working_on_it']) {
      expect(humanAssignmentStatus(token)).not.toBe(token);
    }
  });
});
