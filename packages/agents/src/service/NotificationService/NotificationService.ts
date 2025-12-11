import { StudentNotificationGenerator } from '../../generators/StudentNotificationGenerator';
import { ParentNotificationGenerator } from '../../generators/ParentNotificationGenerator';
import { DeliveryRouter } from '../../delivery/DeliveryRouter';
import { Alert, Notification, DeliveryResult } from '@scholaracle/contracts';

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
   * @param alert - The alert to process
   * @returns Result containing notifications and delivery results
   * @throws {DeliveryError} If delivery fails for any channel
   */
  public async processAlert(alert: Alert): Promise<IProcessAlertResult> {
    const studentNotification = this._studentGenerator.generate(alert);
    const parentNotification = this._parentGenerator.generate(alert);

    const deliveryResults: DeliveryResult[] = [];

    // Deliver student notification to all channels
    for (const channel of studentNotification.channels) {
      const result = await this._deliveryRouter.route(studentNotification, channel);
      deliveryResults.push(result);
    }

    // Deliver parent notification to all channels
    for (const channel of parentNotification.channels) {
      const result = await this._deliveryRouter.route(parentNotification, channel);
      deliveryResults.push(result);
    }

    // Mark notifications as sent after successful delivery
    studentNotification.markSent();
    parentNotification.markSent();

    return {
      studentNotification,
      parentNotification,
      deliveryResults,
    };
  }
}
