import { StudentNotificationGenerator } from './StudentNotificationGenerator';
import { Alert, AlertType, AgentType, NotificationPriority } from '@scholaracle/contracts';
import { NotificationError } from '@scholaracle/contracts';

describe('StudentNotificationGenerator', () => {
  let generator: StudentNotificationGenerator;

  beforeEach(() => {
    generator = new StudentNotificationGenerator();
  });

  describe('generate', () => {
    it('should generate notification for missing assignment alert', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
        },
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.agentType).toBe(AgentType.STUDENT);
      expect(notification.studentId).toBe('student-123');
      expect(notification.userId).toBe('student-123');
      expect(notification.subject).toContain('Missing:');
      expect(notification.body).toContain('Math');
      expect(notification.body).toContain('Homework 5');
      expect(notification.triggerType).toBe(AlertType.MISSING_ASSIGNMENT);
    });

    it('should generate notification for deadline alert', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.DEADLINE,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Science',
          assignment: 'Lab Report',
          dueDate: '2024-11-20T23:59:00Z',
          points: 50,
        },
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.agentType).toBe(AgentType.STUDENT);
      expect(notification.subject).toContain('Due ');
      expect(notification.body).toContain('Science');
      expect(notification.body).toContain('Lab Report');
    });

    it('should generate notification for grade drop alert', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.GRADE_DROP,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          previousGrade: 92,
          currentGrade: 85,
          reason: 'Recent quiz: 70%',
          showGrades: true,
        },
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.agentType).toBe(AgentType.STUDENT);
      expect(notification.body).toContain('92%');
      expect(notification.body).toContain('85%');
    });

    it('should generate notification for test alert', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.TEST,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          testName: 'Chapter 5 Exam',
          testDate: '2024-11-25T09:00:00Z',
          weight: 20,
        },
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.agentType).toBe(AgentType.STUDENT);
      expect(notification.body).toContain('Chapter 5 Exam');
    });

    it('should generate notification for workload alert', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.WORKLOAD,
        studentId: 'student-123',
        severity: 'medium',
        relatedData: {
          assignmentCount: 5,
          isDueThisWeek: true,
        },
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.agentType).toBe(AgentType.STUDENT);
      expect(notification.body).toContain('5');
    });

    it('should generate notification for positive alert', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.POSITIVE,
        studentId: 'student-123',
        severity: 'low',
        relatedData: {
          achievement: 'Great work on recent assignments',
          course: 'Math',
        },
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.agentType).toBe(AgentType.STUDENT);
      expect(notification.body).toContain('Great work');
    });

    it('should map high severity to HIGH priority', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
        },
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.priority).toBe(NotificationPriority.HIGH);
    });

    it('should map medium severity to MEDIUM priority', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.WORKLOAD,
        studentId: 'student-123',
        severity: 'medium',
        relatedData: {
          assignmentCount: 5,
          isDueThisWeek: true,
        },
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.priority).toBe(NotificationPriority.MEDIUM);
    });

    it('should map low severity to LOW priority', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.POSITIVE,
        studentId: 'student-123',
        severity: 'low',
        relatedData: {
          achievement: 'Great work',
          course: 'Math',
        },
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.priority).toBe(NotificationPriority.LOW);
    });

    it('should map critical severity to CRITICAL priority', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'critical',
        relatedData: {
          course: 'Math',
          assignment: 'Final Project',
          daysAgo: 5,
          points: 100,
        },
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.priority).toBe(NotificationPriority.CRITICAL);
    });

    it('should map unknown severity to MEDIUM priority', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'unknown',
        relatedData: {
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
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
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
          assignmentUrl: 'https://canvas.example.com/assignments/123',
        },
      });

      // Act
      const notification = generator.generate(alert);

      // Assert
      expect(notification.actions).toHaveLength(1);
      expect(notification.actions[0]?.label).toBe('Submit Now');
      expect(notification.actions[0]?.url).toBe('https://canvas.example.com/assignments/123');
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
        course: 'Math',
        assignment: 'Homework 5',
        daysAgo: 2,
        points: 25,
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
  });
});
