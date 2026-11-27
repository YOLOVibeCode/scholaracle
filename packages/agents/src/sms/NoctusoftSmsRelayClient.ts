import { SMS_RELAY_SEND_URL } from '@scholaracle/contracts';
import type { SmsAppEnv } from './smsAppEnv';

export interface INoctusoftSmsRelayResult {
  /** Twilio's id for the text. Absent when the relay captured the text instead of sending it. */
  readonly messageSid?: string;
  /** The relay kept the text in its catcher: nothing reached a phone (`X-App-Env: dev`). */
  readonly captured: boolean;
}

export interface INoctusoftSmsRelayOptions {
  /** Sent as `X-App-Env`. Left out, the relay is told `dev`, which it captures and never sends. */
  readonly appEnv?: SmsAppEnv;
  readonly fetchFn?: typeof fetch;
  /** How long to wait for the relay before giving up. */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * The relay did not take the text. It carries the HTTP status and the relay's code and
 * nothing else: what the relay says in words can name the phone number.
 */
export class SmsRelayError extends Error {
  /** HTTP status of the relay's answer; 0 when there was no answer. */
  public readonly status: number;
  /** Twilio's number (21610) or the relay's own word (`SCOPE_FORBIDDEN`), when it gave one. */
  public readonly code?: number | string;
  /** Seconds the relay asks to wait, from `Retry-After`. */
  public readonly retryAfterSeconds?: number;

  constructor(status: number, code?: number | string, retryAfterSeconds?: number) {
    super(status === 0 ? 'SMS relay did not answer' : `SMS relay refused (${status})`);
    this.name = 'SmsRelayError';
    this.status = status;
    if (code !== undefined) this.code = code;
    if (retryAfterSeconds !== undefined) this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface IRelayAnswer {
  readonly captured?: unknown;
  readonly code?: unknown;
  readonly sid?: unknown;
  readonly messageSid?: unknown;
  readonly message?: unknown;
}

function parseAnswer(text: string): IRelayAnswer {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' ? (parsed as IRelayAnswer) : {};
  } catch {
    return {};
  }
}

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** The relay answers with the id at `message.twilio_sid`; older shapes had it at the top. */
function messageSidOf(answer: IRelayAnswer): string | undefined {
  const message = answer.message;
  const nested =
    message !== null && typeof message === 'object'
      ? nonEmptyString((message as { twilio_sid?: unknown }).twilio_sid)
      : undefined;
  return nested ?? nonEmptyString(answer.sid) ?? nonEmptyString(answer.messageSid);
}

function codeOf(answer: IRelayAnswer): number | string | undefined {
  return typeof answer.code === 'number' ? answer.code : nonEmptyString(answer.code);
}

function retryAfterOf(
  headers: { get(name: string): string | null } | undefined
): number | undefined {
  const seconds = Number(headers?.get('retry-after') ?? '');
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

/**
 * POST /sms/send on the Noctusoft Twilio relay (no Twilio SDK).
 */
export class NoctusoftSmsRelayClient {
  private readonly _appEnv: SmsAppEnv;
  private readonly _fetchFn: typeof fetch | undefined;
  private readonly _timeoutMs: number;

  constructor(
    private readonly _apiKey: string,
    options: INoctusoftSmsRelayOptions = {}
  ) {
    this._appEnv = options.appEnv ?? 'dev';
    this._fetchFn = options.fetchFn;
    this._timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  public async send(to: string, body: string): Promise<INoctusoftSmsRelayResult> {
    // Looked up per call, so a test (or a tracing layer) that replaces `fetch` is honoured.
    const fetchFn = this._fetchFn ?? fetch;
    let res: Awaited<ReturnType<typeof fetch>>;
    let text: string;
    try {
      res = await fetchFn(SMS_RELAY_SEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this._apiKey}`,
          'Content-Type': 'application/json',
          'X-App-Env': this._appEnv,
        },
        body: JSON.stringify({ to, body }),
        signal: AbortSignal.timeout(this._timeoutMs),
      });
      text = await res.text();
    } catch {
      // No connection, a timeout, or a body that broke off. The cause is not kept: a
      // network error can quote the request.
      throw new SmsRelayError(0);
    }
    const answer = parseAnswer(text);
    if (!res.ok) {
      throw new SmsRelayError(res.status, codeOf(answer), retryAfterOf(res.headers));
    }
    const messageSid = messageSidOf(answer);
    return {
      captured: answer.captured === true,
      ...(messageSid !== undefined ? { messageSid } : {}),
    };
  }
}
