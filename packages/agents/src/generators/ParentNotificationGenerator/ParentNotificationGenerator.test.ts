import { ParentNotificationGenerator } from './ParentNotificationGenerator';
import { Alert, AlertType, AgentType, NotificationPriority } from '@scholaracle/contracts';
import { NotificationError } from '@scholaracle/contracts';

describe('ParentNotificationGenerator', () => {
  let generator: ParentNotificationGenerator;

  beforeEach(() => {
    generator = new ParentNotificationGenerator();
  });

  describe('generate', () => {
    it('should generate notification for missing assignment alert', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
          gradeImpact: 5,
          currentGrade: 92,
        },
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.agentType).toBe(AgentType.PARENT);
      expect(notification.studentId).toBe('student-123');
      expect(notification.subject).toContain('John Doe');
      expect(notification.subject).toContain('Missing:');
      expect(notification.body).toContain('John Doe');
      expect(notification.triggerType).toBe(AlertType.MISSING_ASSIGNMENT);
    });

    it('should generate notification for deadline alert', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.DEADLINE,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Science',
          assignment: 'Lab Report',
          dueDate: '2024-11-20T23:59:00Z',
          points: 50,
          gradeWeight: 10,
          currentGrade: 88,
        },
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.agentType).toBe(AgentType.PARENT);
      expect(notification.subject).toContain('John Doe');
      expect(notification.subject).toContain('Due ');
      expect(notification.body).toContain('Science');
    });

    it('should generate notification for grade drop alert', () => {
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
      const notification = generator.generate(alert);

      // Assert
      expect(notification.agentType).toBe(AgentType.PARENT);
      expect(notification.body).toContain('92%');
      expect(notification.body).toContain('85%');
      expect(notification.body).toContain('Recommendation:');
    });

    it('should generate notification for test alert', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.TEST,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          testName: 'Chapter 5 Exam',
          testDate: '2024-11-25T09:00:00Z',
          weight: 20,
          currentGrade: 92,
        },
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.agentType).toBe(AgentType.PARENT);
      expect(notification.body).toContain('Chapter 5 Exam');
      expect(notification.body).toContain('92%');
    });

    it('should generate notification for workload alert', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.WORKLOAD,
        studentId: 'student-123',
        severity: 'medium',
        relatedData: {
          studentName: 'John Doe',
          assignmentCount: 5,
          isDueThisWeek: true,
          assignments: [],
        },
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.agentType).toBe(AgentType.PARENT);
      expect(notification.body).toContain('5');
      expect(notification.body).toContain('Monitor');
    });

    it('should generate notification for positive alert', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.POSITIVE,
        studentId: 'student-123',
        severity: 'low',
        relatedData: {
          studentName: 'John Doe',
          achievement: 'Great work on recent assignments',
          course: 'Math',
          currentGrade: 95,
        },
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.agentType).toBe(AgentType.PARENT);
      expect(notification.body).toContain('Great work');
      expect(notification.body).toContain('95%');
    });

    it('should map high severity to HIGH priority', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
          gradeImpact: 5,
          currentGrade: 92,
        },
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.priority).toBe(NotificationPriority.HIGH);
    });

    it('should map critical severity to CRITICAL priority', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'critical',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          assignment: 'Final Project',
          daysAgo: 5,
          points: 100,
          gradeImpact: 20,
          currentGrade: 92,
        },
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.priority).toBe(NotificationPriority.CRITICAL);
    });

    it('should throw NotificationError for unknown alert type', () => {
      // Arrange
      const alert = new Alert({
        type: 'unknown_type' as AlertType,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {},
      });

      // Act & Assert
      expect(() => {
        generator.generate(alert);
      }).toThrow(NotificationError);
    });

    it('should preserve triggerData from alert', () => {
      // Arrange
      const relatedData = {
        studentName: 'John Doe',
        course: 'Math',
        assignment: 'Homework 5',
        daysAgo: 2,
        points: 25,
        gradeImpact: 5,
        currentGrade: 92,
      };
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData,
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.triggerData).toEqual(relatedData);
    });

    it('should map unknown severity to MEDIUM priority', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'unknown',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
          gradeImpact: 5,
          currentGrade: 92,
        },
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.priority).toBe(NotificationPriority.MEDIUM);
    });

    it('should include actions from template', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.DEADLINE,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          assignment: 'Chapter 5 Homework',
          dueDate: '2024-11-20T23:59:00Z',
          points: 25,
          gradeWeight: 5,
          currentGrade: 92,
          assignmentUrl: 'https://canvas.example.com/assignments/123',
        },
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.actions.length).toBeGreaterThan(0);
      expect(notification.actions.some((a) => a.label.includes('View'))).toBe(true);
    });
  });
});
