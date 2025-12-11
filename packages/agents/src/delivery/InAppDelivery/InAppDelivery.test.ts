import { InAppDelivery } from './InAppDelivery';
import {
  Notification,
  NotificationChannel,
  NotificationPriority,
  AgentType,
} from '@scholaracle/contracts';

describe('InAppDelivery', () => {
  let inAppDelivery: InAppDelivery;

  beforeEach(() => {
    inAppDelivery = new InAppDelivery();
  });

  describe('supports', () => {
    it('should return true for in_app channel', () => {
      // Act
      const result = inAppDelivery.supports(NotificationChannel.IN_APP);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for non-in_app channels', () => {
      // Act & Assert
      expect(inAppDelivery.supports(NotificationChannel.EMAIL)).toBe(false);
      expect(inAppDelivery.supports(NotificationChannel.PUSH)).toBe(false);
      expect(inAppDelivery.supports(NotificationChannel.SMS)).toBe(false);
    });
  });

  describe('deliver', () => {
    it('should return success result for in-app notification', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user-456',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
      });

      // Act
      const result = await inAppDelivery.deliver(notification);

      // Assert
      expect(result.success).toBe(true);
      expect(result.channel).toBe(NotificationChannel.IN_APP);
      expect(result.messageId).toBe(`in-app-${notification.id}`);
      expect(result.deliveredAt).toBeInstanceOf(Date);
    });
  });
});
