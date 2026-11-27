import { canvasSubmissionStatus } from './canvas-recipe';

describe('canvasSubmissionStatus', () => {
  it.each([
    ['past due and not handed in', { missing: true, workflow_state: 'unsubmitted' }, 'Missing'],
    ['handed in after the deadline', { late: true, workflow_state: 'submitted' }, 'Late'],
    ['graded', { workflow_state: 'graded' }, 'Graded'],
    ['handed in', { workflow_state: 'submitted' }, 'Submitted'],
    ['not handed in yet', { workflow_state: 'unsubmitted' }, 'Unsubmitted'],
  ])('says %s work is %p -> %s', (_what, submission, expected) => {
    expect(canvasSubmissionStatus(submission)).toBe(expected);
  });

  it('counts work waiting for the teacher to mark it as handed in', () => {
    // A quiz with a written answer stays in this state until the teacher has read it.
    expect(canvasSubmissionStatus({ workflow_state: 'pending_review' })).toBe('Submitted');
  });

  it('puts missing before late, and late before the state', () => {
    expect(canvasSubmissionStatus({ missing: true, late: true, workflow_state: 'graded' })).toBe(
      'Missing'
    );
    expect(canvasSubmissionStatus({ late: true, workflow_state: 'graded' })).toBe('Late');
  });

  it('says nothing when Canvas sends no submission, or a state it does not know', () => {
    expect(canvasSubmissionStatus(undefined)).toBeUndefined();
    expect(canvasSubmissionStatus({})).toBeUndefined();
    expect(canvasSubmissionStatus({ workflow_state: 'deleted' })).toBeUndefined();
  });
});
