import type { ICanvasAssignment, ICanvasSubmission, ICanvasCalendarEvent } from './canvas-client';
import {
  mapCanvasSubmissionStatus,
  transformAssignmentToOp,
  transformCalendarEventToOp,
} from './canvas-transformer';

const BASE_KEY = {
  provider: 'canvas',
  adapterId: 'com.instructure.canvas',
  studentExternalId: 'student-1',
  institutionExternalId: 'school-1',
};

const MOCK_ASSIGNMENT: ICanvasAssignment = {
  id: 42,
  name: 'Homework 3',
  course_id: 10,
  due_at: '2025-10-15T23:59:00Z',
  points_possible: 100,
  submission_types: ['online_text_entry'],
  has_submitted_submissions: false,
};

function makeSubmission(overrides: Partial<ICanvasSubmission> = {}): ICanvasSubmission {
  return {
    id: 99,
    assignment_id: 42,
    user_id: 1,
    score: null,
    grade: null,
    workflow_state: 'unsubmitted',
    submitted_at: null,
    late: false,
    missing: false,
    ...overrides,
  };
}

describe('mapCanvasSubmissionStatus', () => {
  it('should return "unknown" when no submission', () => {
    expect(mapCanvasSubmissionStatus(undefined, MOCK_ASSIGNMENT)).toBe('unknown');
  });

  it('should return "missing" when submission is missing', () => {
    expect(mapCanvasSubmissionStatus(makeSubmission({ missing: true }), MOCK_ASSIGNMENT)).toBe(
      'missing'
    );
  });

  it('should return "late" when submission is late', () => {
    expect(mapCanvasSubmissionStatus(makeSubmission({ late: true }), MOCK_ASSIGNMENT)).toBe('late');
  });

  it('should return "graded" when workflow_state is graded', () => {
    expect(
      mapCanvasSubmissionStatus(makeSubmission({ workflow_state: 'graded' }), MOCK_ASSIGNMENT)
    ).toBe('graded');
  });

  it('should return "submitted" when workflow_state is submitted', () => {
    expect(
      mapCanvasSubmissionStatus(makeSubmission({ workflow_state: 'submitted' }), MOCK_ASSIGNMENT)
    ).toBe('submitted');
  });

  it('should return "unknown" for unsubmitted state', () => {
    expect(
      mapCanvasSubmissionStatus(makeSubmission({ workflow_state: 'unsubmitted' }), MOCK_ASSIGNMENT)
    ).toBe('unknown');
  });

  it('should prioritize missing over late', () => {
    expect(
      mapCanvasSubmissionStatus(makeSubmission({ missing: true, late: true }), MOCK_ASSIGNMENT)
    ).toBe('missing');
  });
});

describe('transformAssignmentToOp', () => {
  it('should produce a valid assignment upsert op', () => {
    const submission = makeSubmission({ workflow_state: 'graded', score: 85 });
    const op = transformAssignmentToOp(MOCK_ASSIGNMENT, submission, BASE_KEY);

    expect(op.op).toBe('upsert');
    expect(op.entity).toBe('assignment');
    expect(op.key.externalId).toBe('canvas-assignment-42');
    expect(op.key.courseExternalId).toBe('canvas-course-10');
    expect(op.key.provider).toBe('canvas');
    expect(op.key.adapterId).toBe('com.instructure.canvas');
    expect(op.observedAt).toBeDefined();
    expect(op.record).toBeDefined();
    expect(op.record?.title).toBe('Homework 3');
    expect(op.record?.dueAt).toBe('2025-10-15T23:59:00Z');
    expect(op.record?.status).toBe('graded');
    expect(op.record?.pointsPossible).toBe(100);
    expect(op.record?.pointsEarned).toBe(85);
  });

  it('should handle missing submission', () => {
    const op = transformAssignmentToOp(MOCK_ASSIGNMENT, undefined, BASE_KEY);

    expect(op.record?.status).toBe('unknown');
    expect(op.record?.pointsEarned).toBeUndefined();
  });

  it('should handle null due_at', () => {
    const noDueAssignment = { ...MOCK_ASSIGNMENT, due_at: null };
    const op = transformAssignmentToOp(noDueAssignment, undefined, BASE_KEY);

    expect(op.record?.dueAt).toBeUndefined();
  });
});

describe('transformCalendarEventToOp', () => {
  const event: ICanvasCalendarEvent = {
    id: 55,
    title: 'Midterm Exam',
    start_at: '2025-10-20T09:00:00Z',
    end_at: '2025-10-20T11:00:00Z',
    type: 'event',
    context_code: 'course_10',
  };

  it('should produce a valid eventSeries upsert op', () => {
    const op = transformCalendarEventToOp(event, BASE_KEY);

    expect(op.op).toBe('upsert');
    expect(op.entity).toBe('eventSeries');
    expect(op.key.externalId).toBe('canvas-event-55');
    expect(op.key.provider).toBe('canvas');
    expect(op.observedAt).toBeDefined();
    expect(op.record).toBeDefined();
    expect(op.record?.title).toBe('Midterm Exam');
    expect(op.record?.startsAt).toBe('2025-10-20T09:00:00Z');
    expect(op.record?.endsAt).toBe('2025-10-20T11:00:00Z');
    expect(op.record?.category).toBe('other');
    expect(op.record?.recurrence.rrule).toBe('FREQ=DAILY;COUNT=1');
    expect(op.record?.recurrence.count).toBe(1);
  });
});
