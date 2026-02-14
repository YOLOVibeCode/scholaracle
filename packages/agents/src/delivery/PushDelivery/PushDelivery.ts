import { INotificationDelivery } from '@scholaracle/interfaces';
import type { Notification } from '@scholaracle/contracts';
import {
  DeliveryResult,
  NotificationChannel,
} from '@scholaracle/contracts';

export interface IPushDeliveryConfig {
  readonly projectId: string;
}

/**
 * Push notification delivery — no-op stub.
 * Push notifications are not implemented. Use EmailDelivery or SMSDelivery instead.
 * This class exists so callers can still register a "push" delivery; it never supports
 * the PUSH channel so no notifications are sent via push.
 */
export class PushDelivery implements INotificationDelivery {
  constructor(_config: IPushDeliveryConfig) {
    // No-op: push not implemented
  }

  public supports(_channel: NotificationChannel): boolean {
    return false;
  }

  public async deliver(_notification: Notification): Promise<DeliveryResult> {
    return {
      success: true,
      channel: NotificationChannel.PUSH,
      messageId: undefined,
      deliveredAt: new Date(),
    };
  }
}
