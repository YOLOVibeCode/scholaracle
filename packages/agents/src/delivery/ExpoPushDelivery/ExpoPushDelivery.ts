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

/** Ids longer than this are dropped: they are never real ids and Expo caps the payload at 4KB. */
const MAX_ROUTING_ID_LENGTH = 128;

function routingId(
  source: Readonly<Record<string, unknown>>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0 && value.length <= MAX_ROUTING_ID_LENGTH) {
      return value;
    }
  }
  return undefined;
}

/**
 * Push `data` the phone uses to open the right screen on tap. `notificationId` and `type` are
 * unchanged (older app builds read only those); the routing ids are added only when present.
 * `studentId` is the student's Mongo id (what the phone's student list calls `id`);
 * `assignmentId` / `courseId` are the portal's raw external ids from the alert's related data.
 */
export function buildPushData(notification: Notification): Record<string, string> {
  const data: Record<string, string> = {
    notificationId: notification.id,
    type: notification.triggerType,
  };
  if (notification.studentId) data['studentId'] = notification.studentId;
  const trigger =
    notification.triggerData && typeof notification.triggerData === 'object'
      ? (notification.triggerData as Readonly<Record<string, unknown>>)
      : {};
  const assignmentId = routingId(trigger, 'assignmentExternalId', 'assignmentId', 'externalId');
  const courseId = routingId(trigger, 'courseExternalId', 'courseId');
  const alertId = routingId(trigger, 'alertId');
  if (assignmentId) data['assignmentId'] = assignmentId;
  if (courseId) data['courseId'] = courseId;
  if (alertId) data['alertId'] = alertId;
  return data;
}

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
        data: buildPushData(notification),
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
