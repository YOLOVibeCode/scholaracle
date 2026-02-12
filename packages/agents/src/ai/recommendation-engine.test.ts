import { RecommendationEngine } from './recommendation-engine';
import type { ITrendData } from '@scholaracle/interfaces';

describe('RecommendationEngine', () => {
  let engine: RecommendationEngine;

  beforeEach(() => {
    // No API key = deterministic-only mode
    engine = new RecommendationEngine({});
  });

  describe('declining grades detection', () => {
    it('should detect declining grades across courses', async () => {
      const data: ITrendData = {
        studentId: 'stu-1',
        grades: [
          { course: 'Math', score: 90, date: '2025-09-01' },
          { course: 'Math', score: 75, date: '2025-10-01' },
        ],
        assignmentCompletionRate: 0.9,
        recentAlertTypes: [],
      };

      const recs = await engine.generateRecommendations(data);
      const gradeRec = recs.find((r) => r.type === 'grade_improvement');

      expect(gradeRec).toBeDefined();
      expect(gradeRec?.priority).toBe('high'); // 15% drop > 10%
      expect(gradeRec?.relatedCourses).toContain('Math');
    });

    it('should not flag courses with improving grades', async () => {
      const data: ITrendData = {
        studentId: 'stu-1',
        grades: [
          { course: 'Math', score: 75, date: '2025-09-01' },
          { course: 'Math', score: 90, date: '2025-10-01' },
        ],
        assignmentCompletionRate: 0.9,
        recentAlertTypes: [],
      };

      const recs = await engine.generateRecommendations(data);
      const gradeRec = recs.find((r) => r.type === 'grade_improvement');
      expect(gradeRec).toBeUndefined();
    });

    it('should set medium priority for small grade drops', async () => {
      const data: ITrendData = {
        studentId: 'stu-1',
        grades: [
          { course: 'English', score: 88, date: '2025-09-01' },
          { course: 'English', score: 82, date: '2025-10-01' },
        ],
        assignmentCompletionRate: 0.9,
        recentAlertTypes: [],
      };

      const recs = await engine.generateRecommendations(data);
      const gradeRec = recs.find((r) => r.type === 'grade_improvement');

      expect(gradeRec).toBeDefined();
      expect(gradeRec?.priority).toBe('medium'); // 6% drop < 10%
    });
  });

  describe('low assignment completion', () => {
    it('should recommend time management when completion < 80%', async () => {
      const data: ITrendData = {
        studentId: 'stu-1',
        grades: [],
        assignmentCompletionRate: 0.7,
        recentAlertTypes: [],
      };

      const recs = await engine.generateRecommendations(data);
      const tmRec = recs.find((r) => r.type === 'time_management');

      expect(tmRec).toBeDefined();
      expect(tmRec?.priority).toBe('medium');
    });

    it('should set high priority when completion < 60%', async () => {
      const data: ITrendData = {
        studentId: 'stu-1',
        grades: [],
        assignmentCompletionRate: 0.5,
        recentAlertTypes: [],
      };

      const recs = await engine.generateRecommendations(data);
      const tmRec = recs.find((r) => r.type === 'time_management');

      expect(tmRec).toBeDefined();
      expect(tmRec?.priority).toBe('high');
    });

    it('should not recommend when completion >= 80%', async () => {
      const data: ITrendData = {
        studentId: 'stu-1',
        grades: [],
        assignmentCompletionRate: 0.85,
        recentAlertTypes: [],
      };

      const recs = await engine.generateRecommendations(data);
      const tmRec = recs.find((r) => r.type === 'time_management');
      expect(tmRec).toBeUndefined();
    });
  });

  describe('frequent missing assignments', () => {
    it('should recommend study habits when 2+ missing assignments', async () => {
      const data: ITrendData = {
        studentId: 'stu-1',
        grades: [],
        assignmentCompletionRate: 0.85,
        recentAlertTypes: ['missing_assignment', 'missing_assignment', 'deadline'],
      };

      const recs = await engine.generateRecommendations(data);
      const shRec = recs.find((r) => r.type === 'study_habit');

      expect(shRec).toBeDefined();
      expect(shRec?.priority).toBe('medium');
    });

    it('should set high priority for 4+ missing assignments', async () => {
      const data: ITrendData = {
        studentId: 'stu-1',
        grades: [],
        assignmentCompletionRate: 0.85,
        recentAlertTypes: [
          'missing_assignment',
          'missing_assignment',
          'missing_assignment',
          'missing_assignment',
        ],
      };

      const recs = await engine.generateRecommendations(data);
      const shRec = recs.find((r) => r.type === 'study_habit');

      expect(shRec).toBeDefined();
      expect(shRec?.priority).toBe('high');
    });
  });

  describe('positive reinforcement', () => {
    it('should suggest positive reinforcement for high performers', async () => {
      const data: ITrendData = {
        studentId: 'stu-1',
        grades: [
          { course: 'Math', score: 90, date: '2025-09-01' },
          { course: 'Math', score: 92, date: '2025-10-01' },
        ],
        assignmentCompletionRate: 0.98,
        recentAlertTypes: [],
      };

      const recs = await engine.generateRecommendations(data);
      const posRec = recs.find((r) => r.type === 'positive_reinforcement');

      expect(posRec).toBeDefined();
      expect(posRec?.priority).toBe('low');
    });

    it('should not give positive reinforcement when grades are declining', async () => {
      const data: ITrendData = {
        studentId: 'stu-1',
        grades: [
          { course: 'Math', score: 95, date: '2025-09-01' },
          { course: 'Math', score: 80, date: '2025-10-01' },
        ],
        assignmentCompletionRate: 0.98,
        recentAlertTypes: [],
      };

      const recs = await engine.generateRecommendations(data);
      const posRec = recs.find((r) => r.type === 'positive_reinforcement');
      expect(posRec).toBeUndefined();
    });
  });

  describe('no grades data', () => {
    it('should handle empty grades array', async () => {
      const data: ITrendData = {
        studentId: 'stu-1',
        grades: [],
        assignmentCompletionRate: 0.9,
        recentAlertTypes: [],
      };

      const recs = await engine.generateRecommendations(data);
      // No grade-related recommendations
      expect(recs.find((r) => r.type === 'grade_improvement')).toBeUndefined();
    });
  });
});
