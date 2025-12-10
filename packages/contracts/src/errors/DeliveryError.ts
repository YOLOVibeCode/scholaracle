import { NotificationError } from './NotificationError';
import { NotificationChannel } from '../enums/NotificationChannel';

/**
 * Error thrown when notification delivery fails.
 */
export class DeliveryError extends NotificationError {
  public readonly channel: NotificationChannel;

  constructor(message: string, channel: NotificationChannel, context?: Record<string, unknown>) {
    super(message, 'DELIVERY_ERROR', context);
    this.name = 'DeliveryError';
    this.channel = channel;
  }
}
