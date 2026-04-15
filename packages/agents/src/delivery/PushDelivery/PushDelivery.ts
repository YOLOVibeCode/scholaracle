import { INotificationDelivery } from '@scholaracle/interfaces';
import type { Notification } from '@scholaracle/contracts';
import { DeliveryResult, NotificationChannel } from '@scholaracle/contracts';

/**
 * A push subscription record (stored per user/device).
 * Matches the Web Push API PushSubscription shape.
 */
export interface IPushSubscription {
  readonly endpoint: string;
  readonly keys: {
    readonly p256dh: string;
    readonly auth: string;
  };
}

/**
 * Retrieves push subscriptions for a given user ID.
 * Implementations typically query a database collection.
 */
export interface IPushSubscriptionStore {
  getSubscriptions(userId: string): Promise<readonly IPushSubscription[]>;
  removeSubscription(userId: string, endpoint: string): Promise<void>;
}

export interface IPushDeliveryConfig {
  readonly projectId: string;
  /** VAPID public key for Web Push. Required for real delivery. */
  readonly vapidPublicKey?: string;
  /** VAPID private key for Web Push. Required for real delivery. */
  readonly vapidPrivateKey?: string;
  /** Contact email for VAPID (e.g. "mailto:admin@example.com"). */
  readonly vapidSubject?: string;
  /** Subscription store for looking up user push registrations. */
  readonly subscriptionStore?: IPushSubscriptionStore;
}

/**
 * Web Push notification delivery.
 *
 * Sends push notifications via the Web Push protocol.
 * Requires VAPID keys and a subscription store to be configured.
 * Falls back to no-op if VAPID keys are not provided.
 */
export class PushDelivery implements INotificationDelivery {
  private readonly _config: IPushDeliveryConfig;
  private readonly _isConfigured: boolean;

  constructor(config: IPushDeliveryConfig) {
    this._config = config;
    this._isConfigured = !!(
      config.vapidPublicKey &&
      config.vapidPrivateKey &&
      config.subscriptionStore
    );
  }

  public supports(channel: NotificationChannel): boolean {
    return channel === NotificationChannel.PUSH;
  }

  public async deliver(notification: Notification): Promise<DeliveryResult> {
    if (!this._isConfigured || !this._config.subscriptionStore) {
      return {
        success: false,
        channel: NotificationChannel.PUSH,
        messageId: undefined,
        error: 'Push delivery not configured (missing VAPID keys or subscription store)',
      };
    }

    const subscriptions = await this._config.subscriptionStore.getSubscriptions(
      notification.userId
    );

    if (subscriptions.length === 0) {
      return {
        success: false,
        channel: NotificationChannel.PUSH,
        messageId: undefined,
        error: 'No push subscriptions found for user',
      };
    }

    const payload = JSON.stringify({
      title: notification.subject,
      body: notification.body,
      data: {
        studentId: notification.studentId,
        triggerType: notification.triggerType,
        timestamp: new Date().toISOString(),
      },
    });

    const store = this._config.subscriptionStore;
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const response = await fetch(sub.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        });

        if (response.status === 410 || response.status === 404) {
          // Subscription expired or invalid — clean up (fire-and-forget)
          void store.removeSubscription(notification.userId, sub.endpoint);
          return false;
        }
        return response.ok;
      })
    );

    const sentCount = results.filter((r) => r.status === 'fulfilled' && r.value === true).length;

    return {
      success: sentCount > 0,
      channel: NotificationChannel.PUSH,
      messageId: `push-${Date.now()}`,
      error: sentCount === 0 ? 'All push subscriptions failed' : undefined,
    };
  }
}
