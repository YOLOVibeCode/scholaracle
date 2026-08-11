/**
 * Expo Push delivery — APNs/FCM via Expo's HTTPS push API.
 *
 * Implements INotificationDelivery so it plugs into DeliveryRouter
 * alongside Email/SMS without changing the NotificationWorker.
 */

import { INotificationDelivery } from '@scholaracle/interfaces';
import type { Notification } from '@scholaracle/contracts';
import { DeliveryResult, NotificationChannel } from '@scholaracle/contracts';

export interface IExpoPushTokenStore {
  getTokens(userId: string): Promise<readonly string[]>;
}

export type ExpoPushSender = (
  messages: ReadonlyArray<{
    readonly to: string;
    readonly title: string;
    readonly body: string;
    readonly data?: Record<string, unknown>;
  }>
) => Promise<{ readonly ok: boolean; readonly error?: string }>;

export interface IExpoPushDeliveryConfig {
  readonly tokenStore: IExpoPushTokenStore;
  /** Injected for tests; defaults to Expo's production endpoint. */
  readonly send?: ExpoPushSender;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function defaultExpoSender(
  messages: ReadonlyArray<{
    readonly to: string;
    readonly title: string;
    readonly body: string;
    readonly data?: Record<string, unknown>;
  }>
): Promise<{ readonly ok: boolean; readonly error?: string }> {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      return { ok: false, error: `Expo push HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Expo push failed' };
  }
}

export class ExpoPushDelivery implements INotificationDelivery {
  private readonly _tokenStore: IExpoPushTokenStore;
  private readonly _send: ExpoPushSender;

  constructor(config: IExpoPushDeliveryConfig) {
    this._tokenStore = config.tokenStore;
    this._send = config.send ?? defaultExpoSender;
  }

  public supports(channel: NotificationChannel): boolean {
    return channel === NotificationChannel.PUSH;
  }

  public async deliver(notification: Notification): Promise<DeliveryResult> {
    const tokens = await this._tokenStore.getTokens(notification.userId);
    if (tokens.length === 0) {
      return {
        success: false,
        channel: NotificationChannel.PUSH,
        messageId: undefined,
        error: 'No Expo push tokens registered for user',
      };
    }

    const result = await this._send(
      tokens.map((to) => ({
        to,
        title: notification.subject,
        body: notification.body,
        data: { notificationId: notification.id, type: notification.triggerType },
      }))
    );

    return {
      success: result.ok,
      channel: NotificationChannel.PUSH,
      messageId: result.ok ? `expo-${notification.id}` : undefined,
      error: result.error,
    };
  }
}
