import { PushDelivery, type IPushSubscriptionStore } from './PushDelivery';
import {
  Notification,
  NotificationChannel,
  NotificationPriority,
  AgentType,
} from '@scholaracle/contracts';

describe('PushDelivery', () => {
  const makeNotification = () =>
    new Notification({
      agentType: AgentType.STUDENT,
      studentId: 'student-123',
      userId: 'user-456',
      subject: 'Test',
      body: 'Test body',
      priority: NotificationPriority.HIGH,
      triggerType: 'missing_assignment',
    });

  describe('supports', () => {
    it('returns true for PUSH channel', () => {
      const delivery = new PushDelivery({ projectId: 'test' });
      expect(delivery.supports(NotificationChannel.PUSH)).toBe(true);
    });

    it('returns false for non-PUSH channels', () => {
      const delivery = new PushDelivery({ projectId: 'test' });
      expect(delivery.supports(NotificationChannel.EMAIL)).toBe(false);
      expect(delivery.supports(NotificationChannel.SMS)).toBe(false);
      expect(delivery.supports(NotificationChannel.IN_APP)).toBe(false);
    });
  });

  describe('deliver (unconfigured)', () => {
    it('returns success with error message when VAPID not configured', async () => {
      const delivery = new PushDelivery({ projectId: 'test' });
      const result = await delivery.deliver(makeNotification());

      expect(result.success).toBe(true);
      expect(result.channel).toBe(NotificationChannel.PUSH);
      expect(result.error).toContain('not configured');
    });
  });

  describe('deliver (configured)', () => {
    let mockStore: jest.Mocked<IPushSubscriptionStore>;

    beforeEach(() => {
      mockStore = {
        getSubscriptions: jest.fn(),
        removeSubscription: jest.fn(),
      };
      jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() => Promise.resolve(new Response(null, { status: 201 })));
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    const makeConfiguredDelivery = () =>
      new PushDelivery({
        projectId: 'test',
        vapidPublicKey: 'BNk...',
        vapidPrivateKey: 'abc...',
        vapidSubject: 'mailto:admin@example.com',
        subscriptionStore: mockStore,
      });

    it('returns success when no subscriptions found', async () => {
      mockStore.getSubscriptions.mockResolvedValue([]);

      const delivery = makeConfiguredDelivery();
      const result = await delivery.deliver(makeNotification());

      expect(result.success).toBe(true);
      expect(result.error).toContain('No push subscriptions');
    });

    it('sends to subscription endpoint and returns success', async () => {
      mockStore.getSubscriptions.mockResolvedValue([
        { endpoint: 'https://push.example.com/sub1', keys: { p256dh: 'key1', auth: 'auth1' } },
      ]);

      const delivery = makeConfiguredDelivery();
      const result = await delivery.deliver(makeNotification());

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://push.example.com/sub1',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('removes expired subscriptions (410 response)', async () => {
      mockStore.getSubscriptions.mockResolvedValue([
        { endpoint: 'https://push.example.com/expired', keys: { p256dh: 'k', auth: 'a' } },
      ]);
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 410 }));

      const delivery = makeConfiguredDelivery();
      await delivery.deliver(makeNotification());

      expect(mockStore.removeSubscription).toHaveBeenCalledWith(
        'user-456',
        'https://push.example.com/expired'
      );
    });

    it('handles fetch errors gracefully', async () => {
      mockStore.getSubscriptions.mockResolvedValue([
        { endpoint: 'https://push.example.com/fail', keys: { p256dh: 'k', auth: 'a' } },
      ]);
      jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const delivery = makeConfiguredDelivery();
      const result = await delivery.deliver(makeNotification());

      expect(result.success).toBe(false);
      expect(result.error).toContain('All push subscriptions failed');
    });
  });
});
