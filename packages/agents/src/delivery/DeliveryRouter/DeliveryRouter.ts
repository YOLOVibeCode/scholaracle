import type { INotificationDelivery } from '@scholaracle/interfaces';
import { Notification, DeliveryResult, NotificationChannel } from '@scholaracle/contracts';

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
   * If no service supports the channel, returns a skipped result instead of throwing,
   * so deployments with only email (e.g. dev/Mailpit) can still deliver.
   *
   * @param notification - The notification to deliver
   * @param channel - The channel to deliver via
   * @returns Delivery result (or skipped result when no service is configured)
   * @throws {DeliveryError} If delivery fails for a supported channel
   */
  public async route(
    notification: Notification,
    channel: NotificationChannel
  ): Promise<DeliveryResult> {
    const service = this._services.find((s) => s.supports(channel));

    if (!service) {
      return {
        success: false,
        channel,
        error: `No delivery service found for channel: ${channel}`,
      };
    }

    return service.deliver(notification);
  }
}
