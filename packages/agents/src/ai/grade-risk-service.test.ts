/**
 * Tests for GradeRiskService: isAvailable, fallback mode, empty input, error handling.
 */
const mockComplete = jest.fn();
jest.mock('./llm-client', () => ({
  LlmClient: jest.fn().mockImplementation(() => ({ complete: mockComplete })),
}));

import { GradeRiskService } from './grade-risk-service';
import type { ICourseGradeInput } from './grade-risk-service';

function makeCourse(overrides: Partial<ICourseGradeInput> = {}): ICourseGradeInput {
  return {
    courseExternalId: 'course-1',
    courseName: 'Math',
    grade: 85,
    letterGrade: 'B',
    totalAssignments: 10,
    gradedAssignments: 8,
    missingAssignments: 1,
    lateAssignments: 0,
    recentTrend: 'stable',
    riskLevel: 'low',
    ...overrides,
  };
}

describe('GradeRiskService', () => {
  describe('isAvailable', () => {
    it('should return false when no API key', () => {
      const service = new GradeRiskService({});
      expect(service.isAvailable()).toBe(false);
    });

    it('should return false when apiKey is empty string', () => {
      const service = new GradeRiskService({ apiKey: '' });
      expect(service.isAvailable()).toBe(false);
    });

    it('should return true when apiKey is set', () => {
      const service = new GradeRiskService({ apiKey: 'sk-test' });
      expect(service.isAvailable()).toBe(true);
    });
  });

  describe('analyze (fallback mode)', () => {
    it('should return fallback with input risk levels when no API key', async () => {
      const service = new GradeRiskService({});
      const courses = [
        makeCourse({ courseExternalId: 'c1', courseName: 'Math', riskLevel: 'medium' }),
        makeCourse({ courseExternalId: 'c2', courseName: 'English', riskLevel: 'high' }),
      ];

      const result = await service.analyze('Student', courses);

      expect(result.courseEnhancements.size).toBe(2);
      expect(result.courseEnhancements.get('c1')?.riskLevel).toBe('medium');
      expect(result.courseEnhancements.get('c2')?.riskLevel).toBe('high');
      expect(result.aiOverview).toBeUndefined();
    });

    it('should return fallback with empty enhancements for empty course list', async () => {
      const service = new GradeRiskService({});
      const result = await service.analyze('Student', []);
      expect(result.courseEnhancements.size).toBe(0);
    });

    it('should preserve riskExplanation in fallback when present on input', async () => {
      const service = new GradeRiskService({});
      const courses = [
        makeCourse({
          courseExternalId: 'c1',
          riskLevel: 'high',
          riskExplanation: 'Multiple missing assignments',
        }),
      ];
      const result = await service.analyze('Student', courses);
      expect(result.courseEnhancements.get('c1')?.riskExplanation).toBe(
        'Multiple missing assignments'
      );
    });
  });

  describe('analyze with mocked LLM', () => {
    beforeEach(() => {
      mockComplete.mockClear();
    });

    it('should return parsed result when LLM returns valid JSON', async () => {
      mockComplete.mockResolvedValueOnce({
        content:
          '{"courses":[{"courseExternalId":"c1","riskLevel":"critical","riskExplanation":"Failing"}],"aiOverview":"Needs attention."}',
      });

      const service = new GradeRiskService({ apiKey: 'sk-test' });
      const courses = [makeCourse({ courseExternalId: 'c1' })];

      const result = await service.analyze('Student', courses);

      expect(result.courseEnhancements.get('c1')?.riskLevel).toBe('critical');
      expect(result.courseEnhancements.get('c1')?.riskExplanation).toBe('Failing');
      expect(result.aiOverview).toBe('Needs attention.');
    });

    it('should return fallback when LLM throws', async () => {
      mockComplete.mockRejectedValueOnce(new Error('API error'));

      const service = new GradeRiskService({ apiKey: 'sk-test' });
      const courses = [makeCourse({ courseExternalId: 'c1', riskLevel: 'low' })];

      const result = await service.analyze('Student', courses);

      expect(result.courseEnhancements.get('c1')?.riskLevel).toBe('low');
      expect(result.aiOverview).toBeUndefined();
    });

    it('should return fallback when LLM returns malformed JSON', async () => {
      mockComplete.mockResolvedValueOnce({ content: 'not json at all' });

      const service = new GradeRiskService({ apiKey: 'sk-test' });
      const courses = [makeCourse({ courseExternalId: 'c1', riskLevel: 'medium' })];

      const result = await service.analyze('Student', courses);

      expect(result.courseEnhancements.get('c1')?.riskLevel).toBe('medium');
    });
  });
});
