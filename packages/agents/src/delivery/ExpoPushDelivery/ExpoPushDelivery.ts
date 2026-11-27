/**
 * Expo Push delivery — APNs/FCM via Expo's HTTPS push API.
 *
 * Implements INotificationDelivery so it plugs into DeliveryRouter
 * alongside Email/SMS without changing the NotificationWorker.
 */

import { INotificationDelivery } from '@scholaracle/interfaces';
import type { Notification } from '@scholaracle/contracts';
import { DeliveryError, DeliveryResult, NotificationChannel } from '@scholaracle/contracts';
import { logger } from '../../logger';

export interface IExpoPushTokenStore {
  getTokens(userId: string): Promise<readonly string[]>;
}

export interface IExpoPushMessage {
  readonly to: string;
  readonly title: string;
  readonly body: string;
  readonly data?: Record<string, unknown>;
}

/** What Expo said about one message. `code` is its `details.error`, when it gave one. */
export type ExpoPushTicket =
  { readonly status: 'ok' } | { readonly status: 'error'; readonly code?: string };

/**
 * What came of one request to Expo.
 * - `tickets`: Expo took the request. One ticket per message, in the order they were sent.
 * - `retry`: nothing was sent and a later try may work (no connection, HTTP 429 or 5xx).
 * - `refused`: Expo refused the whole request, and would refuse the same request again.
 *
 * `reason` goes into the log and the delivery result: a status or a code, never a token.
 */
export type ExpoPushSendResult =
  | { readonly outcome: 'tickets'; readonly tickets: readonly ExpoPushTicket[] }
  | { readonly outcome: 'retry'; readonly reason: string }
  | { readonly outcome: 'refused'; readonly reason: string };

export type ExpoPushSender = (
  messages: ReadonlyArray<IExpoPushMessage>
) => Promise<ExpoPushSendResult>;

export interface IExpoPushDeliveryConfig {
  readonly tokenStore: IExpoPushTokenStore;
  /** Injected for tests; defaults to Expo's production endpoint. */
  readonly send?: ExpoPushSender;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * An error code as Expo or Node writes one: `DeviceNotRegistered`, `TOO_MANY_REQUESTS`,
 * `ECONNRESET`. Anything else is dropped, because Expo's free text quotes the push token.
 */
const CODE = /^[A-Za-z][A-Za-z0-9_]{2,40}$/;

function codeIn(value: unknown): string | undefined {
  return typeof value === 'string' && CODE.test(value) ? value : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

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

/** One ticket as Expo sent it. Anything unexpected counts as a refusal with no reason. */
function ticketIn(raw: unknown): ExpoPushTicket {
  if (!isRecord(raw)) return { status: 'error' };
  if (raw['status'] === 'ok') return { status: 'ok' };
  const details = raw['details'];
  const code = isRecord(details) ? codeIn(details['error']) : undefined;
  return code ? { status: 'error', code } : { status: 'error' };
}

/** `data` is a list of tickets, or one ticket when Expo was sent one message. */
function ticketsIn(reply: unknown): readonly ExpoPushTicket[] {
  const data = isRecord(reply) ? reply['data'] : undefined;
  if (data === undefined || data === null) return [];
  return (Array.isArray(data) ? data : [data]).map(ticketIn);
}

/** `errors[0].code` of a request Expo refused as a whole, e.g. `UNAUTHORIZED`. */
function requestErrorCode(reply: unknown): string | undefined {
  const errors = isRecord(reply) ? reply['errors'] : undefined;
  const first: unknown = Array.isArray(errors) ? errors[0] : undefined;
  return isRecord(first) ? codeIn(first['code']) : undefined;
}

async function replyOf(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

/** `fetch` rejects with an error whose cause carries the network code. */
function networkReason(err: unknown): string {
  const cause = isRecord(err) ? err['cause'] : undefined;
  const code = isRecord(cause) ? codeIn(cause['code']) : undefined;
  return code ? `network ${code}` : 'network';
}

async function defaultExpoSender(
  messages: ReadonlyArray<IExpoPushMessage>
): Promise<ExpoPushSendResult> {
  let res: Response;
  try {
    res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    return { outcome: 'retry', reason: networkReason(err) };
  }
  // Expo asks for these to be tried again after a wait.
  if (res.status === 429 || res.status >= 500) {
    return { outcome: 'retry', reason: `http ${res.status}` };
  }
  const reply = await replyOf(res);
  if (!res.ok) {
    const code = requestErrorCode(reply);
    return {
      outcome: 'refused',
      reason: code ? `http ${res.status} ${code}` : `http ${res.status}`,
    };
  }
  // A 200 means Expo took the request. An answer we cannot read is not sent again:
  // the phones may already have it.
  return { outcome: 'tickets', tickets: ticketsIn(reply) };
}

/** Why Expo did not take a message: its code, or that it said nothing. */
function refusalReason(ticket: ExpoPushTicket | undefined): string {
  if (ticket === undefined) return 'no answer';
  return (ticket.status === 'error' ? ticket.code : undefined) ?? 'no reason given';
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

  /**
   * Send one notification to every phone the user has registered.
   *
   * Delivered means Expo accepted it for at least one phone. Accepted is not arrived: Apple
   * or Google can still refuse it, which only Expo's receipts show.
   *
   * A phone Expo reports as `DeviceNotRegistered` stays registered here. Expo says so when
   * the app was removed or its notifications were turned off, and the same token works again
   * once that is undone. The app uploads its token only when it differs from the one it last
   * uploaded, so a token removed here would not come back.
   *
   * @throws {DeliveryError} When nothing was sent and a later try may work, so the queue retries
   */
  public async deliver(notification: Notification): Promise<DeliveryResult> {
    const tokens = await this._tokenStore.getTokens(notification.userId);
    if (tokens.length === 0) {
      return this._notDelivered('No Expo push tokens registered for user');
    }

    const sent = await this._send(
      tokens.map((to) => ({
        to,
        title: notification.subject,
        body: notification.body,
        data: buildPushData(notification),
      }))
    );

    if (sent.outcome === 'retry') {
      logger.warn(
        { job: 'expo-push', reason: sent.reason, phones: tokens.length },
        'push not sent; the queue retries it'
      );
      throw new DeliveryError(`Expo push not sent: ${sent.reason}`, NotificationChannel.PUSH, {
        notificationId: notification.id,
      });
    }
    if (sent.outcome === 'refused') {
      return this._notDelivered(`Expo refused the request: ${sent.reason}`);
    }

    // Expo answers in the order the messages were sent: one ticket per phone.
    const refused = tokens
      .map((_token, i) => sent.tickets[i])
      .filter((ticket) => ticket?.status !== 'ok');
    const reasons = [...new Set(refused.map(refusalReason))];

    if (refused.length === tokens.length) {
      return this._notDelivered(`Expo did not accept the push: ${reasons.join(', ')}`);
    }
    if (refused.length > 0) {
      logger.info(
        { job: 'expo-push', phones: tokens.length, refused: refused.length, reasons },
        'push accepted for some of the phones'
      );
    }
    return {
      success: true,
      channel: NotificationChannel.PUSH,
      messageId: `expo-${notification.id}`,
      error: undefined,
    };
  }

  private _notDelivered(error: string): DeliveryResult {
    return { success: false, channel: NotificationChannel.PUSH, messageId: undefined, error };
  }
}
