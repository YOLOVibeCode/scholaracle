import type { Db } from 'mongodb';
import { logger } from '../logger';
import { safeInterval } from '../utils/safeInterval';
import { runRepairNightly } from './repair-nightly';
import { buildWorkerRepairDeps } from './workerRepairDeps';

function parseRepairHour(): number | null {
  const raw = process.env['REPAIR_NIGHTLY_UTC_HOUR'];
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 23) return null;
  return n;
}

export function startRepairNightlySchedule(database: Db): NodeJS.Timeout | null {
  const hour = parseRepairHour();
  if (hour === null) return null;

  const billingUserId =
    process.env['SCRAPER_REPAIR_BILLING_USER_ID']?.trim() ?? 'platform-repair-nightly';
  const deps = buildWorkerRepairDeps(database, billingUserId);
  let lastRunDay = '';

  return safeInterval(
    'repair-nightly',
    async () => {
      const now = new Date();
      if (now.getUTCHours() !== hour) return;
      const dayKey = now.toISOString().slice(0, 10);
      if (lastRunDay === dayKey) return;
      lastRunDay = dayKey;
      try {
        const n = await runRepairNightly(database, deps);
        logger.info({ processed: n, job: 'repair-nightly' }, 'nightly repair finished');
      } catch (err) {
        logger.error({ err, job: 'repair-nightly' }, 'nightly repair failed');
      }
    },
    60_000
  );
}
