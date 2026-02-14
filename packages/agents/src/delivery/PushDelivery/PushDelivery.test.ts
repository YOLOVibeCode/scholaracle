import { PushDelivery } from './PushDelivery';
import {
  Notification,
  NotificationChannel,
  NotificationPriority,
  AgentType,
} from '@scholaracle/contracts';

describe('PushDelivery', () => {
  let pushDelivery: PushDelivery;

  const testConfig = {
    projectId: 'test-project',
  };

  beforeEach(() => {
    pushDelivery = new PushDelivery(testConfig);
  });

  describe('supports', () => {
    it('returns false for all channels (push not implemented)', () => {
      expect(pushDelivery.supports(NotificationChannel.PUSH)).toBe(false);
      expect(pushDelivery.supports(NotificationChannel.EMAIL)).toBe(false);
      expect(pushDelivery.supports(NotificationChannel.SMS)).toBe(false);
      expect(pushDelivery.supports(NotificationChannel.IN_APP)).toBe(false);
    });
  });

  describe('deliver', () => {
    it('resolves with success (no-op)', async () => {
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user-456',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'missing_assignment',
      });

      const result = await pushDelivery.deliver(notification);

      expect(result.success).toBe(true);
      expect(result.channel).toBe(NotificationChannel.PUSH);
    });
  });
});
