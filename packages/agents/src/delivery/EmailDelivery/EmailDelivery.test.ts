import { EmailDelivery } from './EmailDelivery';
import {
  Notification,
  NotificationChannel,
  NotificationPriority,
  AgentType,
} from '@scholaracle/contracts';
import { DeliveryError } from '@scholaracle/contracts';
import { IEmailTransport, IEmailEnvelope } from './IEmailTransport';

describe('EmailDelivery', () => {
  let emailDelivery: EmailDelivery;
  let mockTransport: jest.Mocked<IEmailTransport>;

  const testConfig = {
    fromEmail: 'notifications@scholarmancy.com',
    fromName: 'Scholaracle',
  };

  beforeEach(() => {
    mockTransport = {
      send: jest.fn(),
    } as unknown as jest.Mocked<IEmailTransport>;

    emailDelivery = new EmailDelivery(testConfig, mockTransport);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('supports', () => {
    it('should return true for email channel', () => {
      const result = emailDelivery.supports(NotificationChannel.EMAIL);
      expect(result).toBe(true);
    });

    it('should return false for non-email channels', () => {
      expect(emailDelivery.supports(NotificationChannel.PUSH)).toBe(false);
      expect(emailDelivery.supports(NotificationChannel.SMS)).toBe(false);
      expect(emailDelivery.supports(NotificationChannel.IN_APP)).toBe(false);
    });
  });

  describe('deliver', () => {
    it('should deliver email notification successfully', async () => {
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user456@example.com',
        subject: 'Test Subject',
        body: 'Test body content',
        priority: NotificationPriority.HIGH,
        triggerType: 'missing_assignment',
      });

      mockTransport.send.mockResolvedValue({});

      const result = await emailDelivery.deliver(notification);

      expect(result.success).toBe(true);
      expect(result.channel).toBe(NotificationChannel.EMAIL);
      expect(mockTransport.send).toHaveBeenCalledTimes(1);
      const envelope = mockTransport.send.mock.calls[0]?.[0] as IEmailEnvelope;
      expect(envelope.to).toBe('user456@example.com');
      expect(envelope.from).toEqual({
        email: testConfig.fromEmail,
        name: testConfig.fromName,
      });
      expect(envelope.subject).toBe(notification.subject);
      expect(envelope.text).toBe(notification.body);
      expect(envelope.html).toContain(notification.body);
      expect(envelope.html).toContain('Scholarmancy');
    });

    it('should include messageId when transport returns one', async () => {
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user456@example.com',
        subject: 'Test Subject',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
      });

      const messageId = 'sg-message-id-123';
      mockTransport.send.mockResolvedValue({ messageId });

      const result = await emailDelivery.deliver(notification);

      expect(result.messageId).toBe(messageId);
    });

    it('should throw DeliveryError when transport throws', async () => {
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user456@example.com',
        subject: 'Test Subject',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
      });

      mockTransport.send.mockRejectedValue(new Error('Invalid email address'));

      await expect(emailDelivery.deliver(notification)).rejects.toThrow(DeliveryError);
      await expect(emailDelivery.deliver(notification)).rejects.toThrow(
        expect.objectContaining({
          channel: NotificationChannel.EMAIL,
        })
      );
    });

    it('should format HTML email body correctly', async () => {
      const notification = new Notification({
        agentType: AgentType.PARENT,
        studentId: 'student-123',
        userId: 'parent456@example.com',
        subject: 'Grade Drop Alert',
        body: 'John Doe - Math grade dropped from 92% to 85%',
        priority: NotificationPriority.HIGH,
        triggerType: 'grade_drop',
      });

      mockTransport.send.mockResolvedValue({});

      await emailDelivery.deliver(notification);

      const envelope = mockTransport.send.mock.calls[0]?.[0] as IEmailEnvelope;
      expect(envelope.html).toBeDefined();
      expect(envelope.html).toContain('John Doe');
      expect(envelope.html).toContain('92%');
      expect(envelope.html).toContain('85%');
      expect(envelope.html).toContain('Scholarmancy');
    });

    it('should use userId as recipient email', async () => {
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'student@example.com',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.MEDIUM,
        triggerType: 'test',
      });

      mockTransport.send.mockResolvedValue({});

      await emailDelivery.deliver(notification);

      const envelope = mockTransport.send.mock.calls[0]?.[0] as IEmailEnvelope;
      expect(envelope.to).toBe('student@example.com');
    });

    it('should handle error without response object', async () => {
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user456@example.com',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
      });

      mockTransport.send.mockRejectedValue(new Error('Network error'));

      await expect(emailDelivery.deliver(notification)).rejects.toThrow(DeliveryError);
      await expect(emailDelivery.deliver(notification)).rejects.toThrow('Network error');
    });

    it('should handle error with response object missing status or body', async () => {
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user456@example.com',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
      });

      const errorWithPartialResponse = {
        response: {},
      };
      mockTransport.send.mockRejectedValue(errorWithPartialResponse);

      await expect(emailDelivery.deliver(notification)).rejects.toThrow(DeliveryError);
    });
  });
});
