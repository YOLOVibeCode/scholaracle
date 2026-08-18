/**
 * Server-side adapter runner.
 *
 * All providers are now client-side only (mobile app / browser extension / local CLI).
 * Canvas, Skyward, Aeries, Google Classroom, and OneRoster are synced client-side.
 * The server no longer holds school portal or Classroom OAuth tokens for data fetching.
 */

import type { AdapterRunnerFn } from '@scholaracle/agents';
import { getErrorReporter } from '@scholaracle/contracts';
import { logger } from './logger';

const CLIENT_SIDE_PROVIDERS = new Set([
  'canvas',
  'skyward',
  'aeries',
  'google-classroom',
  'oneroster',
]);

/** Create the adapter runner. */
export function createAdapterRunner(): AdapterRunnerFn {
  return async (
    provider: string,
    _adapterId: string,
    _credentials: Record<string, string>,
    _baseUrl: string,
    runId: string
  ) => {
    logger.info({ runId, provider, job: 'adapter-runner' }, 'adapter run started');

    try {
      if (CLIENT_SIDE_PROVIDERS.has(provider)) {
        logger.info({ runId, provider, job: 'adapter-runner' }, 'refused - client-side sync only');
        return {
          success: false,
          summary: {},
          error: `${provider} sync runs on the client device (mobile app, browser extension, or local CLI). Server-side sync for this provider is discontinued.`,
        };
      }

      return { success: false, summary: {}, error: `Unknown provider: ${provider}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, runId, provider, job: 'adapter-runner' }, 'adapter run failed');
      getErrorReporter().captureException(err, { runId, provider, job: 'adapter-runner' });
      return { success: false, summary: {}, error: msg };
    }
  };
}
