/**
 * Orchestrates three-tier extraction: cached -> normal -> AI fallback.
 */

import { createHash } from 'node:crypto';
import type { IStrategyAttempt } from './types';

export type { IExtractionStrategy, ISelectorStep, IStrategyAttempt, IStrategyStore } from './types';

export function computeFingerprint(html: string): string {
  const structural = html
    .replace(/>([^<]+)</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha256').update(structural).digest('hex').slice(0, 16);
}

export async function useStrategy<T>(attempt: IStrategyAttempt<T>): Promise<T> {
  const { extractionId, platform, store, tryCached, tryNormal, tryAi, aiSchema, htmlFingerprint } =
    attempt;

  if (store) {
    const cached = await store.get(extractionId);
    if (cached) {
      const result = await tryCached(cached);
      if (result !== null) {
        return result;
      }
      await store.invalidate(extractionId);
    }
  }

  const normalResult = await tryNormal();
  if (normalResult) {
    if (store) {
      const now = new Date().toISOString();
      await store.save({
        extractionId,
        platform,
        selectors: normalResult.selectors,
        htmlFingerprint,
        version: 1,
        createdAt: now,
        updatedAt: now,
        successCount: 1,
        failCount: 0,
      });
    }
    return normalResult.data;
  }

  if (tryAi && aiSchema) {
    const aiResult = await tryAi(aiSchema);
    if (aiResult) {
      if (store) {
        const now = new Date().toISOString();
        await store.save({
          extractionId,
          platform,
          selectors: aiResult.selectors,
          htmlFingerprint,
          aiSchema,
          version: 1,
          createdAt: now,
          updatedAt: now,
          successCount: 1,
          failCount: 0,
        });
      }
      return aiResult.data;
    }
  }

  throw new Error(`Could not extract data for ${extractionId}`);
}
