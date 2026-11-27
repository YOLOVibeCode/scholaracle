import { AiBudgetError } from '@scholaracle/contracts';
import { logger } from '../logger';
import { LlmHttpError } from './llm-client';

/** Which email asked the model for its short insight. */
export type InsightJob = 'digest-insight' | 'glance-insight';

/** A network error code as Node reports it, e.g. `ECONNRESET` or `UND_ERR_CONNECT_TIMEOUT`. */
const NETWORK_CODE = /^[A-Z][A-Z0-9_]{2,40}$/;

/**
 * Why the model gave no insight, in words that are safe in a log. Never the prompt, the
 * answer or an error's message: the prompt names the student, and a relay's refusal can
 * quote part of the key it was sent.
 */
export function insightFailureReason(err: unknown): string {
  if (err instanceof AiBudgetError) return 'budget exceeded';
  if (err instanceof LlmHttpError) return `http ${err.status}`;
  // A request that got no reply: `fetch` rejects with a TypeError whose cause carries the
  // network code. A TypeError with no cause is a reply we could not read, not the network.
  const cause = err instanceof TypeError ? (err as { readonly cause?: unknown }).cause : undefined;
  if (cause === undefined || cause === null) return 'unknown error';
  const code = (cause as { readonly code?: unknown }).code;
  return typeof code === 'string' && NETWORK_CODE.test(code) ? `network ${code}` : 'network';
}

/**
 * One insight call. The email goes out with or without the insight, so this never throws;
 * the log says which way it went, with the insight's length or the reason and nothing else.
 */
export async function writeInsight(
  job: InsightJob,
  ask: () => Promise<{ readonly content: string }>
): Promise<string | undefined> {
  let text: string;
  try {
    text = (await ask()).content.trim();
  } catch (err) {
    logger.warn({ job, reason: insightFailureReason(err) }, 'AI insight not written');
    return undefined;
  }
  if (text.length === 0) {
    logger.warn({ job, reason: 'empty answer' }, 'AI insight not written');
    return undefined;
  }
  logger.info({ job, chars: text.length }, 'AI insight written');
  return text;
}
