import { GradeDropTemplate } from './GradeDropTemplate';
import { Alert, AlertType } from '@scholaracle/contracts';

describe('GradeDropTemplate (Parent)', () => {
  let template: GradeDropTemplate;

  beforeEach(() => {
    template = new GradeDropTemplate();
  });

  describe('generate', () => {
    it('should generate subject with student name and grade change', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.GRADE_DROP,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          previousGrade: 92,
          currentGrade: 85,
          change: -7,
          timeframe: 'Last week',
          contributingFactors: ['Quiz 5: 70%'],
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.subject).toContain('John Doe');
      expect(result.subject).toContain('Grade Drop');
    });

    it('should include student name and course', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.GRADE_DROP,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          previousGrade: 92,
          currentGrade: 85,
          change: -7,
          timeframe: 'Last week',
          contributingFactors: ['Quiz 5: 70%'],
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('John Doe');
      expect(result.body).toContain('Math');
    });

    it('should include grade change details', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.GRADE_DROP,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          previousGrade: 92,
          currentGrade: 85,
          change: -7,
          timeframe: 'Last week',
          contributingFactors: ['Quiz 5: 70%'],
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('92%');
      expect(result.body).toContain('85%');
      expect(result.body).toContain('-7%');
    });

    it('should include contributing factors', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.GRADE_DROP,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          previousGrade: 92,
          currentGrade: 85,
          change: -7,
          timeframe: 'Last week',
          contributingFactors: ['Quiz 5: 70%', 'Homework 12: 80%'],
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Quiz 5: 70%');
    });

    it('should include recommendations', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.GRADE_DROP,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          previousGrade: 92,
          currentGrade: 85,
          change: -7,
          timeframe: 'Last week',
          contributingFactors: ['Quiz 5: 70%'],
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Recommendation:');
    });

    it('should show correct letter grade for A (90+)', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.GRADE_DROP,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          previousGrade: 95,
          currentGrade: 92,
          change: -3,
          timeframe: 'Last week',
          contributingFactors: [],
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('(A)');
    });

    it('should show correct letter grade for B (80-89)', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.GRADE_DROP,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          previousGrade: 85,
          currentGrade: 82,
          change: -3,
          timeframe: 'Last week',
          contributingFactors: [],
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('(B)');
    });

    it('should show correct letter grade for C (70-79)', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.GRADE_DROP,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          previousGrade: 75,
          currentGrade: 72,
          change: -3,
          timeframe: 'Last week',
          contributingFactors: [],
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('(C)');
    });

    it('should show correct letter grade for D (60-69)', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.GRADE_DROP,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          previousGrade: 65,
          currentGrade: 62,
          change: -3,
          timeframe: 'Last week',
          contributingFactors: [],
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('(D)');
    });

    it('should show correct letter grade for F (<60)', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.GRADE_DROP,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          previousGrade: 55,
          currentGrade: 52,
          change: -3,
          timeframe: 'Last week',
          contributingFactors: [],
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('(F)');
    });

    it('should handle positive change (grade increase)', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.GRADE_DROP,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          previousGrade: 85,
          currentGrade: 90,
          change: 5,
          timeframe: 'Last week',
          contributingFactors: [],
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('+5%');
    });
  });
});
