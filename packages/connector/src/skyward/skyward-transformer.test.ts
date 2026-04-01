import type { ISkywardLineItem, ISkywardResult } from './skyward-client';
import {
  mapSkywardResultStatus,
  transformClassToOp,
  transformLineItemToOp,
  transformGradeSnapshotToOp,
} from './skyward-transformer';

const BASE_KEY = {
  provider: 'skyward-qmlativ',
  adapterId: 'com.skyward.qmlativ',
  studentExternalId: 'self',
  institutionExternalId: 'skyward-instance',
};

describe('skyward-transformer', () => {
  describe('mapSkywardResultStatus', () => {
    const baseLineItem: ISkywardLineItem = {
      sourcedId: 'li1',
      title: 'Test',
      class: { sourcedId: 'c1' },
      resultValueMax: 100,
      status: 'active',
    };

    it('should return "missing" when no result and past due', () => {
      const pastDueItem: ISkywardLineItem = { ...baseLineItem, dueDate: '2020-01-01' };
      expect(mapSkywardResultStatus(undefined, pastDueItem)).toBe('missing');
    });

    it('should return "not_started" when no result and not past due', () => {
      const futureItem: ISkywardLineItem = { ...baseLineItem, dueDate: '2099-01-01' };
      expect(mapSkywardResultStatus(undefined, futureItem)).toBe('not_started');
    });

    it('should return "graded" when fully graded', () => {
      const result: ISkywardResult = {
        sourcedId: 'r1',
        lineItem: { sourcedId: 'li1' },
        student: { sourcedId: 's1' },
        score: 90,
        scoreStatus: 'fully graded',
        status: 'active',
      };
      expect(mapSkywardResultStatus(result, baseLineItem)).toBe('graded');
    });

    it('should return "submitted" when partially graded', () => {
      const result: ISkywardResult = {
        sourcedId: 'r1',
        lineItem: { sourcedId: 'li1' },
        student: { sourcedId: 's1' },
        scoreStatus: 'partially graded',
        status: 'active',
      };
      expect(mapSkywardResultStatus(result, baseLineItem)).toBe('submitted');
    });

    it('should return "graded" when exempt', () => {
      const result: ISkywardResult = {
        sourcedId: 'r1',
        lineItem: { sourcedId: 'li1' },
        student: { sourcedId: 's1' },
        scoreStatus: 'exempt',
        status: 'active',
      };
      expect(mapSkywardResultStatus(result, baseLineItem)).toBe('graded');
    });

    it('should return "missing" when not submitted and past due', () => {
      const pastDueItem: ISkywardLineItem = { ...baseLineItem, dueDate: '2020-01-01' };
      const result: ISkywardResult = {
        sourcedId: 'r1',
        lineItem: { sourcedId: 'li1' },
        student: { sourcedId: 's1' },
        scoreStatus: 'not submitted',
        status: 'active',
      };
      expect(mapSkywardResultStatus(result, pastDueItem)).toBe('missing');
    });
  });

  describe('transformClassToOp', () => {
    it('should create a course upsert op', () => {
      const op = transformClassToOp(
        { sourcedId: 'c1', title: 'Algebra', course: { sourcedId: 'co1' }, status: 'active' },
        BASE_KEY
      );

      expect(op.op).toBe('upsert');
      expect(op.entity).toBe('course');
      expect(op.key.externalId).toBe('skyward-class-c1');
      expect(op.record.title).toBe('Algebra');
    });
  });

  describe('transformLineItemToOp', () => {
    it('should create an assignment upsert op with result data', () => {
      const lineItem: ISkywardLineItem = {
        sourcedId: 'li1',
        title: 'Chapter Test',
        dueDate: '2025-12-01',
        class: { sourcedId: 'c1' },
        resultValueMax: 50,
        status: 'active',
      };
      const result: ISkywardResult = {
        sourcedId: 'r1',
        lineItem: { sourcedId: 'li1' },
        student: { sourcedId: 's1' },
        score: 45,
        scoreStatus: 'fully graded',
        status: 'active',
      };

      const op = transformLineItemToOp(lineItem, result, BASE_KEY);

      expect(op.op).toBe('upsert');
      expect(op.entity).toBe('assignment');
      expect(op.key.externalId).toBe('skyward-lineitem-li1');
      expect(op.key.courseExternalId).toBe('skyward-class-c1');
      expect(op.record.title).toBe('Chapter Test');
      expect(op.record.pointsEarned).toBe(45);
      expect(op.record.pointsPossible).toBe(50);
      expect(op.record.status).toBe('graded');
    });
  });

  describe('transformGradeSnapshotToOp', () => {
    it('should compute percent grade', () => {
      const op = transformGradeSnapshotToOp('c1', 85, 100, BASE_KEY);

      expect(op.op).toBe('upsert');
      expect(op.entity).toBe('gradeSnapshot');
      expect(op.key.courseExternalId).toBe('skyward-class-c1');
      expect(op.record.percentGrade).toBe(85);
    });

    it('should handle zero total possible', () => {
      const op = transformGradeSnapshotToOp('c1', 0, 0, BASE_KEY);
      expect(op.record.percentGrade).toBe(0);
    });
  });
});
