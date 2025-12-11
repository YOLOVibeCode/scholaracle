import type { INotificationDelivery } from '@scholaracle/interfaces';
import {
  Notification,
  DeliveryResult,
  NotificationChannel,
  DeliveryError,
} from '@scholaracle/contracts';

/**
 * Routes notifications to the appropriate delivery service based on channel.
 */
export class DeliveryRouter {
  private readonly _services: readonly INotificationDelivery[];

  constructor(services: readonly INotificationDelivery[]) {
    this._services = services;
  }

  /**
   * Route a notification to the appropriate delivery service.
   *
   * @param notification - The notification to deliver
   * @param channel - The channel to deliver via
   * @returns Delivery result
   * @throws {DeliveryError} If no service supports the channel or delivery fails
   */
  public async route(
    notification: Notification,
    channel: NotificationChannel
  ): Promise<DeliveryResult> {
    const service = this._services.find((s) => s.supports(channel));

    if (!service) {
      throw new DeliveryError(`No delivery service found for channel: ${channel}`, channel, {
        notificationId: notification.id,
      });
    }

    return service.deliver(notification);
  }
}
