import type { Request, Response, NextFunction } from 'express';

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

function parseUnixTimestamp(value: string): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n < 1e12 ? n * 1000 : n;
}

function bodyStringMap(body: unknown): Record<string, string> {
  if (body === null || typeof body !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(body as Record<string, unknown>)) {
    if (val === undefined || val === null) continue;
    out[key] = typeof val === 'string' ? val : String(val);
  }
  return out;
}

/**
 * Event time for the freshness window: only an explicit `Timestamp` field counts.
 * Carrier fields such as `RawDlrDoneDate` are deliberately ignored: they have no time
 * zone and minute precision, and carriers report them late, so using them rejected
 * legitimate delivery receipts. Replays are stopped by the relay signature plus the
 * MessageSid+MessageStatus dedupe.
 */
export function resolveTwilioWebhookEventTimeMs(body: unknown): number {
  const map = bodyStringMap(body);
  const ts = map['Timestamp'] ?? map['timestamp'];
  if (ts !== undefined) {
    const parsed = parseUnixTimestamp(ts);
    if (parsed !== undefined) return parsed;
  }
  return Date.now();
}

export function resolveTwilioWebhookMaxAgeMs(): number {
  const raw = process.env['TWILIO_WEBHOOK_MAX_AGE_MS'];
  if (raw === undefined || raw === '') return DEFAULT_MAX_AGE_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_AGE_MS;
}

export interface ITwilioReplayWindowOptions {
  readonly maxAgeMs: number;
}

export function requireTwilioWebhookFreshness(options: ITwilioReplayWindowOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const eventMs = resolveTwilioWebhookEventTimeMs(req.body);
    const skewMs = Math.abs(Date.now() - eventMs);
    if (skewMs > options.maxAgeMs) {
      res.status(401).json({ error: 'Webhook request outside allowed time window' });
      return;
    }
    next();
  };
}
