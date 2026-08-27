import { GradeDropTemplate } from './GradeDropTemplate';
import { Alert, AlertType } from '@scholaracle/contracts';

function dropAlert(overrides?: Record<string, unknown>): Alert {
  return new Alert({
    type: AlertType.GRADE_DROP,
    studentId: 'student-123',
    severity: 'high',
    relatedData: {
      course: 'Math',
      previousGrade: 92,
      currentGrade: 85,
      reason: 'Recent quiz: 70%',
      ...overrides,
    },
  });
}

describe('GradeDropTemplate', () => {
  let template: GradeDropTemplate;

  beforeEach(() => {
    template = new GradeDropTemplate();
  });

  describe('generate', () => {
    it('omits percent and letter when showGrades is false (default)', () => {
      const result = template.generate(dropAlert());
      expect(result.subject).not.toMatch(/%/);
      expect(result.body).not.toMatch(/\d+\s*%/);
      expect(result.body).not.toMatch(/\b[ABCDF][+-]?\b/);
      expect(result.body).toContain('Math');
      expect(result.body).toMatch(/review/i);
    });

    it('should generate correct subject when showGrades is true', () => {
      const result = template.generate(dropAlert({ showGrades: true }));
      expect(result.subject).toContain('Grade Drop');
    });

    it('should include course name in body', () => {
      const result = template.generate(dropAlert({ showGrades: true }));
      expect(result.body).toContain('Math');
    });

    it('should show grade drop in body when showGrades is true', () => {
      const result = template.generate(dropAlert({ showGrades: true }));
      expect(result.body).toContain('92%');
      expect(result.body).toContain('85%');
    });

    it('should include reason in body when showGrades is true', () => {
      const result = template.generate(
        dropAlert({ course: 'Science', previousGrade: 88, currentGrade: 82, showGrades: true })
      );
      expect(result.body).toContain('Recent quiz: 70%');
    });

    it('should include action instruction', () => {
      const result = template.generate(dropAlert({ showGrades: true }));
      expect(result.body).toContain('Review');
    });
  });
});
