/**
 * ExpoPushDelivery tests (TDD).
 */

import {
  Notification,
  NotificationChannel,
  NotificationPriority,
  AgentType,
} from '@scholaracle/contracts';
import { ExpoPushDelivery, buildPushData, type IExpoPushTokenStore } from './ExpoPushDelivery';

function makeNotification(triggerData?: unknown): Notification {
  return new Notification({
    agentType: AgentType.STUDENT,
    studentId: 'student-1',
    userId: 'user-1',
    subject: 'Missing assignment',
    body: 'Math homework is overdue',
    priority: NotificationPriority.HIGH,
    triggerType: 'missing_assignment',
    triggerData,
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
    const send = jest.fn().mockResolvedValue({ outcome: 'tickets', tickets: [{ status: 'ok' }] });
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

  it('should surface a request the sender says was refused', async () => {
    const delivery = new ExpoPushDelivery({
      tokenStore: { getTokens: async () => ['ExponentPushToken[abc]'] },
      send: async () => ({ outcome: 'refused', reason: 'http 401 UNAUTHORIZED' }),
    });
    const result = await delivery.deliver(makeNotification());
    expect(result.success).toBe(false);
    expect(result.error).toBe('Expo refused the request: http 401 UNAUTHORIZED');
  });
});

describe('buildPushData', () => {
  it('keeps notificationId and type, and adds studentId', () => {
    const n = makeNotification();
    expect(buildPushData(n)).toEqual({
      notificationId: n.id,
      type: 'missing_assignment',
      studentId: 'student-1',
    });
  });

  it('adds assignmentId, courseId and alertId from the alert related data', () => {
    const n = makeNotification({
      externalId: 'asg-9',
      courseExternalId: 'course-3',
      alertId: 'alert-7',
      title: 'ignored',
    });
    expect(buildPushData(n)).toEqual({
      notificationId: n.id,
      type: 'missing_assignment',
      studentId: 'student-1',
      assignmentId: 'asg-9',
      courseId: 'course-3',
      alertId: 'alert-7',
    });
  });

  it('prefers assignmentExternalId over externalId', () => {
    const data = buildPushData(
      makeNotification({ assignmentExternalId: 'a-1', externalId: 'a-2' })
    );
    expect(data['assignmentId']).toBe('a-1');
  });

  it('omits missing, non-string, empty and oversized ids', () => {
    const data = buildPushData(
      makeNotification({ externalId: 42, courseExternalId: '', alertId: 'x'.repeat(200) })
    );
    expect(data).not.toHaveProperty('assignmentId');
    expect(data).not.toHaveProperty('courseId');
    expect(data).not.toHaveProperty('alertId');
  });

  it('tolerates non-object triggerData', () => {
    expect(buildPushData(makeNotification('oops'))).not.toHaveProperty('assignmentId');
    expect(buildPushData(makeNotification(null))).not.toHaveProperty('courseId');
  });

  it('is what deliver() sends as data', async () => {
    const send = jest.fn().mockResolvedValue({ outcome: 'tickets', tickets: [{ status: 'ok' }] });
    const delivery = new ExpoPushDelivery({
      tokenStore: { getTokens: async () => ['ExponentPushToken[abc]'] },
      send,
    });
    const n = makeNotification({ courseExternalId: 'c-1' });
    await delivery.deliver(n);
    expect(send).toHaveBeenCalledWith([expect.objectContaining({ data: buildPushData(n) })]);
  });
});
