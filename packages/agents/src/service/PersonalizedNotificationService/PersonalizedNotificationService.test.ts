import {
  Alert,
  AlertType,
  Notification,
  AgentType,
  NotificationPriority,
} from '@scholaracle/contracts';
import type {
  IPersonalizationService,
  IPersonalizationInput,
  IPersonalizationResult,
} from '@scholaracle/interfaces';
import { NotificationService, type IProcessAlertResult } from '../NotificationService';
import { PersonalizedNotificationService } from './PersonalizedNotificationService';

function makeAlert(): Alert {
  return new Alert({
    type: AlertType.DEADLINE,
    studentId: 'student-1',
    severity: 'medium',
    relatedData: { course: 'Math', assignment: 'HW3', dueDate: '2025-10-15', points: 50 },
  });
}

function makeNotification(agentType: AgentType, subject: string, body: string): Notification {
  return new Notification({
    agentType,
    studentId: 'student-1',
    userId: 'student-1',
    subject,
    body,
    priority: NotificationPriority.MEDIUM,
    triggerType: 'deadline',
  });
}

function createMockNotificationService(result: IProcessAlertResult): NotificationService {
  return {
    processAlert: jest.fn().mockResolvedValue(result),
  } as unknown as NotificationService;
}

function createMockPersonalizationService(
  isAvailable: boolean,
  enhanceFn?: (input: IPersonalizationInput) => Promise<IPersonalizationResult>
): IPersonalizationService {
  return {
    isAvailable: jest.fn().mockReturnValue(isAvailable),
    enhance:
      enhanceFn ??
      jest.fn().mockResolvedValue({
        subject: 'Enhanced Subject',
        body: 'Enhanced body',
        wasPersonalized: true,
      }),
  };
}

describe('PersonalizedNotificationService', () => {
  it('should pass through unmodified when personalization is unavailable', async () => {
    const studentNotification = makeNotification(
      AgentType.STUDENT,
      'Original Subject',
      'Original body'
    );
    const parentNotification = makeNotification(AgentType.PARENT, 'Parent Subject', 'Parent body');

    const mockResult: IProcessAlertResult = {
      studentNotification,
      parentNotification,
      deliveryResults: [],
    };

    const mockNS = createMockNotificationService(mockResult);
    const mockPS = createMockPersonalizationService(false);

    const svc = new PersonalizedNotificationService({
      notificationService: mockNS,
      personalizationService: mockPS,
    });

    const alert = makeAlert();
    const result = await svc.processAlert(alert);

    expect(result.studentNotification.subject).toBe('Original Subject');
    expect(result.parentNotification.subject).toBe('Parent Subject');
    expect(mockPS.enhance).not.toHaveBeenCalled();
  });

  it('should enhance both notifications when personalization is available', async () => {
    const studentNotification = makeNotification(AgentType.STUDENT, 'Original', 'Body');
    const parentNotification = makeNotification(AgentType.PARENT, 'Parent Original', 'Parent Body');

    const mockResult: IProcessAlertResult = {
      studentNotification,
      parentNotification,
      deliveryResults: [],
    };

    const mockNS = createMockNotificationService(mockResult);

    let callCount = 0;
    const mockPS = createMockPersonalizationService(true, async (input) => {
      callCount++;
      return {
        subject: `Enhanced ${input.agentType} Subject`,
        body: `Enhanced ${input.agentType} body`,
        wasPersonalized: true,
      };
    });

    const svc = new PersonalizedNotificationService({
      notificationService: mockNS,
      personalizationService: mockPS,
    });

    const result = await svc.processAlert(makeAlert());

    expect(callCount).toBe(2); // Called for both student and parent
    expect(result.studentNotification.subject).toBe('Enhanced student Subject');
    expect(result.parentNotification.subject).toBe('Enhanced parent Subject');
  });

  it('should use custom tones when provided', async () => {
    const studentNotification = makeNotification(AgentType.STUDENT, 'S', 'B');
    const parentNotification = makeNotification(AgentType.PARENT, 'P', 'PB');

    const mockResult: IProcessAlertResult = {
      studentNotification,
      parentNotification,
      deliveryResults: [],
    };

    const mockNS = createMockNotificationService(mockResult);

    const tones: string[] = [];
    const mockPS = createMockPersonalizationService(true, async (input) => {
      tones.push(input.tone);
      return { subject: input.subject, body: input.body, wasPersonalized: false };
    });

    const svc = new PersonalizedNotificationService({
      notificationService: mockNS,
      personalizationService: mockPS,
      defaultTone: 'formal',
    });

    await svc.processAlert(makeAlert(), {
      studentTone: 'casual',
      parentTone: 'formal',
    });

    expect(tones[0]).toBe('casual');
    expect(tones[1]).toBe('formal');
  });

  it('should not update content when wasPersonalized is false', async () => {
    const studentNotification = makeNotification(AgentType.STUDENT, 'Keep This', 'Keep Body');
    const parentNotification = makeNotification(
      AgentType.PARENT,
      'Keep Parent',
      'Keep Parent Body'
    );

    const mockResult: IProcessAlertResult = {
      studentNotification,
      parentNotification,
      deliveryResults: [],
    };

    const mockNS = createMockNotificationService(mockResult);
    const mockPS = createMockPersonalizationService(true, async (_input) => ({
      subject: 'Would Replace',
      body: 'Would Replace Body',
      wasPersonalized: false,
    }));

    const svc = new PersonalizedNotificationService({
      notificationService: mockNS,
      personalizationService: mockPS,
    });

    const result = await svc.processAlert(makeAlert());

    expect(result.studentNotification.subject).toBe('Keep This');
    expect(result.parentNotification.subject).toBe('Keep Parent');
  });
});
