/**
 * ExpoPushDelivery tests (TDD).
 */

import {
  Notification,
  NotificationChannel,
  NotificationPriority,
  AgentType,
} from '@scholaracle/contracts';
import { ExpoPushDelivery, type IExpoPushTokenStore } from './ExpoPushDelivery';

function makeNotification(): Notification {
  return new Notification({
    agentType: AgentType.STUDENT,
    studentId: 'student-1',
    userId: 'user-1',
    subject: 'Missing assignment',
    body: 'Math homework is overdue',
    priority: NotificationPriority.HIGH,
    triggerType: 'missing_assignment',
  });
}

describe('ExpoPushDelivery', () => {
  it('should support PUSH channel only', () => {
    const delivery = new ExpoPushDelivery({
      tokenStore: { getTokens: async () => [] },
    });
    expect(delivery.supports(NotificationChannel.PUSH)).toBe(true);
    expect(delivery.supports(NotificationChannel.EMAIL)).toBe(false);
  });

  it('should fail when user has no tokens', async () => {
    const delivery = new ExpoPushDelivery({
      tokenStore: { getTokens: async () => [] },
    });
    const result = await delivery.deliver(makeNotification());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No Expo push tokens/i);
  });

  it('should send via injected sender and succeed', async () => {
    const send = jest.fn().mockResolvedValue({ ok: true });
    const tokenStore: IExpoPushTokenStore = {
      getTokens: async () => ['ExponentPushToken[abc]'],
    };
    const delivery = new ExpoPushDelivery({ tokenStore, send });
    const result = await delivery.deliver(makeNotification());
    expect(result.success).toBe(true);
    expect(send).toHaveBeenCalledWith([
      expect.objectContaining({
        to: 'ExponentPushToken[abc]',
        title: 'Missing assignment',
        body: 'Math homework is overdue',
      }),
    ]);
  });

  it('should surface sender errors', async () => {
    const delivery = new ExpoPushDelivery({
      tokenStore: { getTokens: async () => ['ExponentPushToken[abc]'] },
      send: async () => ({ ok: false, error: 'rate limited' }),
    });
    const result = await delivery.deliver(makeNotification());
    expect(result.success).toBe(false);
    expect(result.error).toBe('rate limited');
  });
});
