import type { INotificationAgent } from '@scholaracle/interfaces';
import type { IEmailDigestPendingItem } from '@scholaracle/database';
import { StudentNotificationGenerator } from '../../generators/StudentNotificationGenerator';
import { ParentNotificationGenerator } from '../../generators/ParentNotificationGenerator';
import { DeliveryRouter } from '../../delivery/DeliveryRouter';
import { MongoQueue } from '../../queue/MongoQueue';
import { shouldNotifyStudent, shouldNotifyParent } from '../../config/alert-audience';
import {
  Alert,
  Notification,
  DeliveryResult,
  AgentType,
  NotificationPriority,
  NotificationChannel,
  type INotificationPayload,
} from '@scholaracle/contracts';

export interface IResolvedRecipient {
  parentEmail?: string;
  parentPhone?: string;
  /** When set, used for SMS digest preference lookup (e.g. account owner). */
  userId?: string;
  /** Distinguishes student (alertEmail) from parents (owner + sharedWith) for routing. */
  recipientType?: 'parent' | 'student';
}

/** @deprecated Use IResolvedRecipient (singular). Kept for backwards compat. */
export type IResolvedRecipients = IResolvedRecipient;

export interface ISmsDigestPreference {
  readonly enabled: boolean;
  readonly time?: string;
}

export interface INotificationServiceSmsDigestOptions {
  readonly getSmsDigestPreference?: (userId: string) => Promise<ISmsDigestPreference | null>;
  readonly enqueueSmsForDigest?: (
    userId: string,
    phone: string,
    subject: string,
    body: string
  ) => Promise<void>;
}

export interface IEmailDigestPreference {
  readonly enabled: boolean;
  readonly time?: string;
  readonly frequency?: 'minimal' | 'balanced' | 'proactive';
}

export interface INotificationServiceEmailDigestOptions {
  readonly getEmailDigestPreference?: (userId: string) => Promise<IEmailDigestPreference | null>;
  readonly enqueueEmailForDigest?: (item: IEmailDigestPendingItem) => Promise<void>;
  readonly dashboardBaseUrl?: string;
}

export interface IProcessAlertResult {
  readonly studentNotification: Notification;
  readonly parentNotification: Notification;
  readonly deliveryResults: readonly DeliveryResult[];
}

export interface IProcessAlertEnqueueDeliverResult {
  readonly notifications: Notification[];
  readonly deliveryJobIds: string[];
}

/**
 * Orchestrates notification generation and delivery.
 * Generates notifications for both student and parent, then delivers through all specified channels.
 * When SMS digest options are provided, SMS for recipients with digest enabled are queued for daily batch.
 */
export class NotificationService {
  private readonly _studentGenerator?: StudentNotificationGenerator;
  private readonly _parentGenerator?: ParentNotificationGenerator;
  private readonly _agents?: readonly INotificationAgent[];
  private readonly _deliveryRouter: DeliveryRouter;
  private readonly _smsDigestOptions?: INotificationServiceSmsDigestOptions;
  private readonly _emailDigestOptions?: INotificationServiceEmailDigestOptions;

  constructor(
    agents: readonly INotificationAgent[],
    deliveryRouter: DeliveryRouter,
    smsDigestOptions?: INotificationServiceSmsDigestOptions,
    emailDigestOptions?: INotificationServiceEmailDigestOptions
  );
  constructor(
    studentGenerator: StudentNotificationGenerator,
    parentGenerator: ParentNotificationGenerator,
    deliveryRouter: DeliveryRouter,
    smsDigestOptions?: INotificationServiceSmsDigestOptions,
    emailDigestOptions?: INotificationServiceEmailDigestOptions
  );
  constructor(
    first: StudentNotificationGenerator | readonly INotificationAgent[],
    second: ParentNotificationGenerator | DeliveryRouter,
    third?: DeliveryRouter | INotificationServiceSmsDigestOptions,
    fourth?: INotificationServiceSmsDigestOptions | INotificationServiceEmailDigestOptions,
    fifth?: INotificationServiceEmailDigestOptions
  ) {
    if (Array.isArray(first)) {
      this._agents = first;
      this._deliveryRouter = second as DeliveryRouter;
      this._smsDigestOptions = third as INotificationServiceSmsDigestOptions | undefined;
      this._emailDigestOptions = fourth as INotificationServiceEmailDigestOptions | undefined;
      this._studentGenerator = undefined;
      this._parentGenerator = undefined;
    } else {
      this._studentGenerator = first as StudentNotificationGenerator;
      this._parentGenerator = second as ParentNotificationGenerator;
      this._deliveryRouter = third as DeliveryRouter;
      this._smsDigestOptions = fourth as INotificationServiceSmsDigestOptions | undefined;
      this._emailDigestOptions = fifth;
      this._agents = undefined;
    }
  }

  /**
   * If SMS digest is enabled for this recipient, enqueue for digest and record result; return true.
   * Otherwise return false so caller sends immediately.
   */
  private async _tryDeferSmsToDigest(
    channel: NotificationChannel,
    recipient: IResolvedRecipient,
    parentNotification: Notification,
    deliveryResults: DeliveryResult[]
  ): Promise<boolean> {
    if (
      channel !== NotificationChannel.SMS ||
      !recipient.userId ||
      !recipient.parentPhone ||
      !this._smsDigestOptions?.getSmsDigestPreference ||
      !this._smsDigestOptions?.enqueueSmsForDigest
    )
      return false;
    const pref = await this._smsDigestOptions.getSmsDigestPreference(recipient.userId);
    if (!pref?.enabled) return false;
    await this._smsDigestOptions.enqueueSmsForDigest(
      recipient.userId,
      recipient.parentPhone,
      parentNotification.subject,
      parentNotification.body
    );
    deliveryResults.push({
      success: true,
      channel: NotificationChannel.SMS,
      messageId: 'digest-deferred',
      deliveredAt: new Date(),
    });
    return true;
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
  // eslint-disable-next-line complexity
  public async processAlert(
    alert: Alert,
    resolvedRecipients?: IResolvedRecipient | readonly IResolvedRecipient[]
  ): Promise<IProcessAlertResult> {
    if (this._agents) {
      return this._processAlertWithAgents(alert);
    }

    const studentNotification = this._studentGenerator!.generate(alert);
    const parentNotification = this._parentGenerator!.generate(alert);

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

      const isDefaultSingleRecipient =
        recipients.length === 1 && !recipients[0]!.parentEmail && !recipients[0]!.parentPhone;
      for (const recipient of recipients) {
        for (const channel of parentNotification.channels) {
          if (
            channel === NotificationChannel.EMAIL &&
            !recipient.parentEmail &&
            !isDefaultSingleRecipient
          )
            continue;
          if (
            channel === NotificationChannel.SMS &&
            !recipient.parentPhone &&
            !isDefaultSingleRecipient
          )
            continue;
          const to =
            channel === NotificationChannel.EMAIL
              ? (recipient.parentEmail ?? parentNotification.userId)
              : channel === NotificationChannel.SMS
                ? (recipient.parentPhone ?? parentNotification.userId)
                : parentNotification.userId;

          const deferred = await this._tryDeferSmsToDigest(
            channel,
            recipient,
            parentNotification,
            deliveryResults
          );
          if (deferred) continue;

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

  private async _processAlertWithAgents(alert: Alert): Promise<IProcessAlertResult> {
    const deliveryResults: DeliveryResult[] = [];
    const notifications: Notification[] = [];

    for (const agent of this._agents!) {
      if (!agent.handles(alert)) continue;
      const notification = agent.generate(alert);
      for (const channel of notification.channels) {
        const result = await this._deliveryRouter.route(notification, channel);
        deliveryResults.push(result);
      }
      notification.markSent();
      notifications.push(notification);
    }

    const studentNotification =
      notifications.find((n) => n.agentType === AgentType.STUDENT) ?? notifications[0];
    const parentNotification =
      notifications.find((n) => n.agentType === AgentType.PARENT) ?? notifications[0];

    if (!studentNotification || !parentNotification) {
      const placeholder = new Notification({
        agentType: AgentType.STUDENT,
        studentId: alert.studentId,
        userId: alert.studentId,
        subject: '',
        body: '',
        priority: NotificationPriority.MEDIUM,
        triggerType: alert.type,
      });
      return {
        studentNotification: studentNotification ?? placeholder,
        parentNotification: parentNotification ?? placeholder,
        deliveryResults,
      };
    }

    return {
      studentNotification,
      parentNotification,
      deliveryResults,
    };
  }

  /**
   * Two-phase: generate notifications only and enqueue one deliver job per (recipient, channel).
   * Bakes resolved email/phone into payload.userId so deliver worker needs no DB lookup.
   */
  public async processAlertEnqueueDeliver(
    alert: Alert,
    queue: MongoQueue,
    resolvedRecipients?: IResolvedRecipient | readonly IResolvedRecipient[]
  ): Promise<IProcessAlertEnqueueDeliverResult> {
    if (!this._agents) {
      throw new Error('processAlertEnqueueDeliver requires agent-based NotificationService');
    }
    const notifications: Notification[] = [];
    const deliveryJobIds: string[] = [];

    const recipients: readonly IResolvedRecipient[] = resolvedRecipients
      ? Array.isArray(resolvedRecipients)
        ? resolvedRecipients
        : [resolvedRecipients]
      : [{}];
    const isDefaultSingleRecipient =
      recipients.length === 1 && !recipients[0]!.parentEmail && !recipients[0]!.parentPhone;

    for (const agent of this._agents) {
      if (!agent.handles(alert)) continue;
      const notification = agent.generate(alert);
      notifications.push(notification);
    }

    const studentNotification =
      notifications.find((n) => n.agentType === AgentType.STUDENT) ?? notifications[0];
    const parentNotification =
      notifications.find((n) => n.agentType === AgentType.PARENT) ?? studentNotification;

    for (const recipient of recipients) {
      const useStudent = recipient.recipientType === 'student';
      const notification = useStudent
        ? (studentNotification ?? parentNotification)
        : (parentNotification ?? studentNotification);
      if (!notification) continue;

      const basePayload = this._serializeNotification(notification);

      for (const channel of notification.channels) {
        if (
          channel === NotificationChannel.EMAIL &&
          !recipient.parentEmail &&
          !isDefaultSingleRecipient
        )
          continue;
        if (
          channel === NotificationChannel.SMS &&
          !recipient.parentPhone &&
          !isDefaultSingleRecipient
        )
          continue;

        if (channel === NotificationChannel.SMS && recipient.userId && recipient.parentPhone) {
          const deferred = await this._tryDeferSmsToDigestEnqueue(
            recipient,
            notification.subject,
            notification.body
          );
          if (deferred) continue;
        }

        if (channel === NotificationChannel.EMAIL && recipient.userId && recipient.parentEmail) {
          const deferred = await this._tryDeferEmailToDigestEnqueue(alert, recipient, notification);
          if (deferred) continue;
        }

        const to =
          channel === NotificationChannel.EMAIL
            ? (recipient.parentEmail ?? notification.userId)
            : channel === NotificationChannel.SMS
              ? (recipient.parentPhone ?? notification.userId)
              : notification.userId;

        const payload: INotificationPayload = { ...basePayload, userId: to };
        const jobId = await queue.add(
          'deliver',
          'deliver-one',
          { notificationPayload: payload, channel },
          { maxAttempts: 5 }
        );
        deliveryJobIds.push(jobId);
      }
    }

    if (studentNotification) studentNotification.markSent();
    if (parentNotification) parentNotification.markSent();

    return { notifications, deliveryJobIds };
  }

  /** Returns true if SMS was deferred to digest; caller should not enqueue deliver job. */
  private async _tryDeferSmsToDigestEnqueue(
    recipient: IResolvedRecipient,
    subject: string,
    body: string
  ): Promise<boolean> {
    if (
      !recipient.userId ||
      !recipient.parentPhone ||
      !this._smsDigestOptions?.getSmsDigestPreference ||
      !this._smsDigestOptions?.enqueueSmsForDigest
    )
      return false;
    const pref = await this._smsDigestOptions.getSmsDigestPreference(recipient.userId);
    if (!pref?.enabled) return false;
    await this._smsDigestOptions.enqueueSmsForDigest(
      recipient.userId,
      recipient.parentPhone,
      subject,
      body
    );
    return true;
  }

  /** Returns true if email was deferred to digest; caller should not enqueue deliver job. */
  private async _tryDeferEmailToDigestEnqueue(
    alert: Alert,
    recipient: IResolvedRecipient,
    notification: Notification
  ): Promise<boolean> {
    if (
      !recipient.userId ||
      !recipient.parentEmail ||
      !this._emailDigestOptions?.getEmailDigestPreference ||
      !this._emailDigestOptions?.enqueueEmailForDigest
    )
      return false;
    const pref = await this._emailDigestOptions.getEmailDigestPreference(recipient.userId);
    if (!pref?.enabled) return false;
    const frequency = pref.frequency ?? 'balanced';
    if (frequency === 'proactive') return false;
    const severity = alert.severity ?? 'info';
    if (severity === 'critical') return false;
    if (frequency === 'balanced' && severity !== 'warning' && severity !== 'info') return false;
    const relatedData = (alert.relatedData ?? {}) as Record<string, unknown>;
    const dashboardUrl = this._emailDigestOptions.dashboardBaseUrl
      ? `${this._emailDigestOptions.dashboardBaseUrl}/dashboard/students/${notification.studentId}/workflow`
      : undefined;
    const item: IEmailDigestPendingItem = {
      userId: recipient.userId,
      recipientEmail: recipient.parentEmail,
      alertType: alert.type,
      severity,
      subject: notification.subject,
      body: notification.body,
      studentName: (relatedData['studentName'] as string) ?? undefined,
      courseName: (relatedData['course'] as string) ?? undefined,
      assignmentTitle: (relatedData['title'] as string) ?? undefined,
      dashboardUrl,
      recipientType: recipient.recipientType,
      studentId: notification.studentId,
      courseExternalId: (relatedData['courseExternalId'] as string) ?? undefined,
      assignmentExternalId: (relatedData['assignmentExternalId'] as string) ?? undefined,
      createdAt: new Date(),
    };
    await this._emailDigestOptions.enqueueEmailForDigest(item);
    return true;
  }

  /**
   * Two-phase: deliver a single (notification, channel) from a deliver job payload.
   */
  public async deliverOne(
    payload: INotificationPayload,
    channel: NotificationChannel
  ): Promise<DeliveryResult> {
    const notification = Notification.fromPayload(payload);
    return this._deliveryRouter.route(notification, channel);
  }

  private _serializeNotification(notification: Notification): INotificationPayload {
    return {
      id: notification.id,
      agentType: notification.agentType,
      studentId: notification.studentId,
      userId: notification.userId,
      subject: notification.subject,
      body: notification.body,
      priority: notification.priority,
      triggerType: notification.triggerType,
      triggerData: notification.triggerData,
      actions: notification.actions,
      channels: notification.channels,
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
