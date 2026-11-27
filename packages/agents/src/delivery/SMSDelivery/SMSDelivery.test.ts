import { SMSDelivery } from './SMSDelivery';
import {
  Notification,
  NotificationChannel,
  NotificationPriority,
  AgentType,
  DeliveryError,
} from '@scholaracle/contracts';
import { SmsNotSentError, type GuardedSmsSender } from '../../sms/GuardedSmsSender';

describe('SMSDelivery', () => {
  let smsDelivery: SMSDelivery;
  let mockGuarded: jest.Mocked<Pick<GuardedSmsSender, 'sendTransactional'>>;

  beforeEach(() => {
    mockGuarded = {
      sendTransactional: jest.fn().mockResolvedValue({ messageId: 'SM123' }),
    };
    smsDelivery = new SMSDelivery(mockGuarded as unknown as GuardedSmsSender);
  });

  it('supports SMS channel only', () => {
    expect(smsDelivery.supports(NotificationChannel.SMS)).toBe(true);
    expect(smsDelivery.supports(NotificationChannel.EMAIL)).toBe(false);
  });

  it('sends the concise one-segment SMS template for the alert, not the email body', async () => {
    const notification = new Notification({
      id: 'n1',
      agentType: AgentType.PARENT,
      studentId: 'stu-1',
      userId: '+15125550100',
      subject: 'Emma - Math Grade Drop: 85% \u2192 72%',
      body: 'GRADE DROP ALERT\n\nStudent: Emma\nCourse: Math ...',
      priority: NotificationPriority.CRITICAL,
      triggerType: 'grade_drop',
      triggerData: {
        studentName: 'Emma Johnson',
        course: 'Math',
        previousGrade: 85,
        currentGrade: 72,
      },
      channels: [NotificationChannel.SMS],
    });
    const result = await smsDelivery.deliver(notification);
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('SM123');
    expect(mockGuarded.sendTransactional).toHaveBeenCalledWith(
      '+15125550100',
      "Scholarmancy: Emma's Math grade dropped from 85% to 72%. Details: https://scholarmancy.com/alerts Reply STOP to opt out.",
      expect.objectContaining({ templateName: 'sms_grade_drop' })
    );
  });

  it('links to the configured web origin', async () => {
    const delivery = new SMSDelivery(mockGuarded as unknown as GuardedSmsSender, {
      webOrigin: 'https://web-dev.example',
    });
    await delivery.deliver(
      new Notification({
        agentType: AgentType.PARENT,
        studentId: 'stu-1',
        userId: '+15125550100',
        subject: 's',
        body: 'b',
        priority: NotificationPriority.CRITICAL,
        triggerType: 'workload',
        triggerData: { studentName: 'Emma', assignmentCount: 3, isDueThisWeek: true },
        channels: [NotificationChannel.SMS],
      })
    );
    expect(mockGuarded.sendTransactional.mock.calls[0]![1]).toContain(
      'Details: https://web-dev.example/alerts'
    );
  });

  describe('whose text it is', () => {
    function textTo(recipientUserId?: string): Notification {
      return new Notification({
        agentType: AgentType.PARENT,
        studentId: 'stu-1',
        userId: '+15125550100',
        ...(recipientUserId !== undefined ? { recipientUserId } : {}),
        subject: 's',
        body: 'b',
        priority: NotificationPriority.HIGH,
        triggerType: 'workload',
        triggerData: { studentName: 'Emma', assignmentCount: 3, isDueThisWeek: true },
        channels: [NotificationChannel.SMS],
      });
    }

    it("goes to the phone number and is logged for the person's account", async () => {
      await smsDelivery.deliver(textTo('account-1'));

      const [to, , meta] = mockGuarded.sendTransactional.mock.calls[0]!;
      expect(to).toBe('+15125550100');
      expect(meta).toMatchObject({ userId: 'account-1' });
    });

    it('names no account when the job did not say whose text it is', async () => {
      await smsDelivery.deliver(textTo());

      const [, , meta] = mockGuarded.sendTransactional.mock.calls[0]!;
      // The phone number is not an account: the sender falls back to it on its own.
      expect(meta?.userId).toBeUndefined();
    });
  });

  describe('a text that is not sent', () => {
    const text = (): Notification =>
      new Notification({
        id: 'n1',
        agentType: AgentType.PARENT,
        studentId: 'stu-1',
        userId: '+15125550100',
        subject: 's',
        body: 'b',
        priority: NotificationPriority.HIGH,
        triggerType: 'workload',
        triggerData: { studentName: 'Emma', assignmentCount: 3, isDueThisWeek: true },
        channels: [NotificationChannel.SMS],
      });

    it.each([
      ['recipient', 'no_consent'],
      ['recipient', 'opted_out'],
      ['recipient', 'invalid_phone'],
      ['refused', 'relay_http_403'],
      ['rate_limited', 'rate_limited'],
    ] as const)(
      'is not delivered and is not tried again when trying again would end the same way (%s: %s)',
      async (kind, reason) => {
        mockGuarded.sendTransactional.mockRejectedValue(new SmsNotSentError(reason, kind));

        const result = await smsDelivery.deliver(text());

        expect(result).toEqual({
          success: false,
          channel: NotificationChannel.SMS,
          error: reason,
        });
      }
    );

    it('is handed back to be tried again when the relay could not be reached', async () => {
      const unreachable = new SmsNotSentError('relay_unreachable', 'unavailable');
      mockGuarded.sendTransactional.mockRejectedValue(unreachable);

      await expect(smsDelivery.deliver(text())).rejects.toBe(unreachable);
    });

    it('is tried again after an error nobody expected, and the error names nobody', async () => {
      mockGuarded.sendTransactional.mockRejectedValue(
        new Error('cannot read properties of +15125550100')
      );

      const failure = await smsDelivery.deliver(text()).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(DeliveryError);
      expect((failure as DeliveryError).message).toBe('SMS not sent: unexpected_error');
      expect(JSON.stringify((failure as DeliveryError).context)).not.toContain('5125550100');
    });
  });
});
