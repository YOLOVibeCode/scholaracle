import type { Db } from 'mongodb';
import type { ScraperRepairQuotaResult } from '@scholaracle/agents';
import { checkAiRateLimit } from '../ai-rate-limit';

export async function checkScraperRepairPlanQuota(
  database: Db,
  userId: string
): Promise<ScraperRepairQuotaResult> {
  const result = await checkAiRateLimit(database, userId, 'scraper_repair');
  if (!result.allowed) {
    return {
      ok: false,
      status: 429,
      message: `Plan AI repair limit reached (${result.limit} per month).`,
    };
  }
  return { ok: true };
}
