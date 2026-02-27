import { StudentNotificationGenerator } from '../../generators/StudentNotificationGenerator';
import { ParentNotificationGenerator } from '../../generators/ParentNotificationGenerator';
import { DeliveryRouter } from '../../delivery/DeliveryRouter';
import { shouldNotifyStudent, shouldNotifyParent } from '../../config/alert-audience';
import {
  Alert,
  Notification,
  DeliveryResult,
  AgentType,
  NotificationPriority,
  NotificationChannel,
} from '@scholaracle/contracts';

export interface IResolvedRecipient {
  parentEmail?: string;
  parentPhone?: string;
}

/** @deprecated Use IResolvedRecipient (singular). Kept for backwards compat. */
export type IResolvedRecipients = IResolvedRecipient;

export interface IProcessAlertResult {
  readonly studentNotification: Notification;
  readonly parentNotification: Notification;
  readonly deliveryResults: readonly DeliveryResult[];
}

/**
 * Orchestrates notification generation and delivery.
 * Generates notifications for both student and parent, then delivers through all specified channels.
 */
export class NotificationService {
  private readonly _studentGenerator: StudentNotificationGenerator;
  private readonly _parentGenerator: ParentNotificationGenerator;
  private readonly _deliveryRouter: DeliveryRouter;

  constructor(
    studentGenerator: StudentNotificationGenerator,
    parentGenerator: ParentNotificationGenerator,
    deliveryRouter: DeliveryRouter
  ) {
    this._studentGenerator = studentGenerator;
    this._parentGenerator = parentGenerator;
    this._deliveryRouter = deliveryRouter;
  }

  /**
   * Process an alert by generating and delivering notifications.
   *
   * Supports multiple parents: pass an array of resolvedRecipients to
   * broadcast the same parent notification to all parents/guardians.
   *
   * @param alert - The alert to process
   * @param resolvedRecipients - Optional resolved parent email/phone(s) for delivery.
   *   Pass a single object for one parent, or an array for multi-parent broadcast.
   * @returns Result containing notifications and delivery results
   * @throws {DeliveryError} If delivery fails for any channel
   */
  public async processAlert(
    alert: Alert,
    resolvedRecipients?: IResolvedRecipient | readonly IResolvedRecipient[]
  ): Promise<IProcessAlertResult> {
    const studentNotification = this._studentGenerator.generate(alert);
    const parentNotification = this._parentGenerator.generate(alert);

    const deliveryResults: DeliveryResult[] = [];

    if (shouldNotifyStudent(alert.type)) {
      for (const channel of studentNotification.channels) {
        const result = await this._deliveryRouter.route(studentNotification, channel);
        deliveryResults.push(result);
      }
      studentNotification.markSent();
    }

    if (shouldNotifyParent(alert.type)) {
      // Normalize to array for multi-parent broadcast
      const recipients: readonly IResolvedRecipient[] = resolvedRecipients
        ? Array.isArray(resolvedRecipients)
          ? resolvedRecipients
          : [resolvedRecipients]
        : [{}]; // empty = use parentNotification.userId as-is

      for (const recipient of recipients) {
        for (const channel of parentNotification.channels) {
          const to =
            channel === NotificationChannel.EMAIL
              ? (recipient.parentEmail ?? parentNotification.userId)
              : channel === NotificationChannel.SMS
                ? (recipient.parentPhone ?? parentNotification.userId)
                : parentNotification.userId;
          const notifToSend =
            to !== parentNotification.userId
              ? new Notification({
                  agentType: parentNotification.agentType,
                  studentId: parentNotification.studentId,
                  userId: to,
                  subject: parentNotification.subject,
                  body: parentNotification.body,
                  priority: parentNotification.priority,
                  triggerType: parentNotification.triggerType,
                  triggerData: parentNotification.triggerData,
                  channels: parentNotification.channels,
                  actions: parentNotification.actions,
                })
              : parentNotification;
          const result = await this._deliveryRouter.route(notifToSend, channel);
          deliveryResults.push(result);
        }
      }
      parentNotification.markSent();
    }

    return {
      studentNotification,
      parentNotification,
      deliveryResults,
    };
  }

  /**
   * Send a one-off reminder (e.g. agenda item reminder) to a single channel.
   * recipient is email address for EMAIL or phone number for SMS.
   */
  public async sendReminder(
    recipient: string,
    channel: 'email' | 'sms',
    subject: string,
    body: string,
    options?: { studentId?: string }
  ): Promise<DeliveryResult> {
    const notif = new Notification({
      agentType: AgentType.PARENT,
      studentId: options?.studentId ?? 'reminder',
      userId: recipient,
      subject,
      body,
      priority: NotificationPriority.MEDIUM,
      triggerType: 'agenda_remind',
      channels: [channel === 'email' ? NotificationChannel.EMAIL : NotificationChannel.SMS],
    });
    const ch = channel === 'email' ? NotificationChannel.EMAIL : NotificationChannel.SMS;
    return this._deliveryRouter.route(notif, ch);
  }
}
