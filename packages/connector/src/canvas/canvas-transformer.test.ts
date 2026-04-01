import type { ICanvasAssignment, ICanvasSubmission, ICanvasEnrollment } from './canvas-client';
import {
  mapCanvasSubmissionStatus,
  transformCourseToOp,
  transformAssignmentToOp,
  transformGradeSnapshotToOp,
} from './canvas-transformer';

const BASE_KEY = {
  provider: 'canvas',
  adapterId: 'com.instructure.canvas',
  studentExternalId: 'self',
  institutionExternalId: 'canvas-instance',
};

describe('canvas-transformer', () => {
  describe('mapCanvasSubmissionStatus', () => {
    const baseAssignment: ICanvasAssignment = {
      id: 1,
      course_id: 1,
      name: 'Test',
      points_possible: 100,
      submission_types: ['online_text_entry'],
      workflow_state: 'published',
    };

    it('should return "unknown" when no submission', () => {
      expect(mapCanvasSubmissionStatus(undefined, baseAssignment)).toBe('unknown');
    });

    it('should return "missing" when submission is missing', () => {
      const sub: ICanvasSubmission = {
        id: 1,
        assignment_id: 1,
        user_id: 1,
        missing: true,
        workflow_state: 'unsubmitted',
      };
      expect(mapCanvasSubmissionStatus(sub, baseAssignment)).toBe('missing');
    });

    it('should return "late" when submission is late', () => {
      const sub: ICanvasSubmission = {
        id: 1,
        assignment_id: 1,
        user_id: 1,
        late: true,
        workflow_state: 'submitted',
      };
      expect(mapCanvasSubmissionStatus(sub, baseAssignment)).toBe('late');
    });

    it('should return "graded" when workflow_state is graded', () => {
      const sub: ICanvasSubmission = {
        id: 1,
        assignment_id: 1,
        user_id: 1,
        score: 90,
        workflow_state: 'graded',
      };
      expect(mapCanvasSubmissionStatus(sub, baseAssignment)).toBe('graded');
    });

    it('should return "submitted" when workflow_state is submitted', () => {
      const sub: ICanvasSubmission = {
        id: 1,
        assignment_id: 1,
        user_id: 1,
        workflow_state: 'submitted',
      };
      expect(mapCanvasSubmissionStatus(sub, baseAssignment)).toBe('submitted');
    });

    it('should return "missing" when unsubmitted and past due', () => {
      const pastDueAssignment: ICanvasAssignment = {
        ...baseAssignment,
        due_at: '2020-01-01T00:00:00Z',
      };
      const sub: ICanvasSubmission = {
        id: 1,
        assignment_id: 1,
        user_id: 1,
        workflow_state: 'unsubmitted',
      };
      expect(mapCanvasSubmissionStatus(sub, pastDueAssignment)).toBe('missing');
    });

    it('should return "not_started" when unsubmitted and not past due', () => {
      const futureAssignment: ICanvasAssignment = {
        ...baseAssignment,
        due_at: '2099-01-01T00:00:00Z',
      };
      const sub: ICanvasSubmission = {
        id: 1,
        assignment_id: 1,
        user_id: 1,
        workflow_state: 'unsubmitted',
      };
      expect(mapCanvasSubmissionStatus(sub, futureAssignment)).toBe('not_started');
    });
  });

  describe('transformCourseToOp', () => {
    it('should create a course upsert op', () => {
      const op = transformCourseToOp(
        { id: 42, name: 'Algebra II', course_code: 'MATH201', workflow_state: 'available' },
        BASE_KEY
      );

      expect(op.op).toBe('upsert');
      expect(op.entity).toBe('course');
      expect(op.key.externalId).toBe('canvas-course-42');
      expect(op.record.title).toBe('Algebra II');
      expect(op.record.courseCode).toBe('MATH201');
    });
  });

  describe('transformAssignmentToOp', () => {
    it('should create an assignment upsert op with submission data', () => {
      const assignment: ICanvasAssignment = {
        id: 10,
        course_id: 1,
        name: 'Chapter Review',
        due_at: '2025-12-01T23:59:00Z',
        points_possible: 50,
        submission_types: ['online_text_entry'],
        workflow_state: 'published',
      };
      const submission: ICanvasSubmission = {
        id: 100,
        assignment_id: 10,
        user_id: 1,
        score: 45,
        workflow_state: 'graded',
      };

      const op = transformAssignmentToOp(assignment, submission, BASE_KEY);

      expect(op.op).toBe('upsert');
      expect(op.entity).toBe('assignment');
      expect(op.key.externalId).toBe('canvas-assignment-10');
      expect(op.key.courseExternalId).toBe('canvas-course-1');
      expect(op.record.title).toBe('Chapter Review');
      expect(op.record.pointsEarned).toBe(45);
      expect(op.record.pointsPossible).toBe(50);
      expect(op.record.status).toBe('graded');
    });

    it('should handle missing submission', () => {
      const assignment: ICanvasAssignment = {
        id: 10,
        course_id: 1,
        name: 'Test',
        submission_types: ['online_text_entry'],
        workflow_state: 'published',
      };

      const op = transformAssignmentToOp(assignment, undefined, BASE_KEY);

      expect(op.record.status).toBe('unknown');
      expect(op.record.pointsEarned).toBeUndefined();
    });
  });

  describe('transformGradeSnapshotToOp', () => {
    it('should create a grade snapshot from enrollment', () => {
      const enrollment: ICanvasEnrollment = {
        id: 200,
        course_id: 1,
        user_id: 1,
        type: 'StudentEnrollment',
        enrollment_state: 'active',
        grades: { current_score: 88.5, current_grade: 'B+' },
      };

      const op = transformGradeSnapshotToOp(1, enrollment, BASE_KEY);

      expect(op.op).toBe('upsert');
      expect(op.entity).toBe('gradeSnapshot');
      expect(op.key.courseExternalId).toBe('canvas-course-1');
      expect(op.record.percentGrade).toBe(88.5);
      expect(op.record.letterGrade).toBe('B+');
    });
  });
});
