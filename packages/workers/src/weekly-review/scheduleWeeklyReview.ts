import type { Db } from 'mongodb';
import {
  WeeklyReviewSender,
  type IWeeklyReviewQueue,
  type IWeeklyReviewTickResult,
} from '@scholaracle/agents';
import { logger } from '../logger';
import { safeInterval } from '../utils/safeInterval';

/**
 * Weekly review schedule (student review spec §3.3, R4). Every tick asks the sender
 * for each student whose local clock has passed Sunday 18:00 since their last send;
 * the sender's (student, ISO week) reservation makes ticks idempotent, so a tick can
 * run as often as we like and a missed Sunday is caught up once on the next tick.
 *
 * Off unless `WEEKLY_REVIEW_ENABLED=true`, so it can be turned on per environment
 * (UAT first) after the code is deployed.
 */

export const WEEKLY_REVIEW_DEFAULT_INTERVAL_MS = 15 * 60_000;
/** A 15-minute cadence is the design; the floor keeps a typo from hammering Mongo. */
export const WEEKLY_REVIEW_MIN_INTERVAL_MS = 60_000;
/** First tick shortly after boot catches up a Sunday 18:00 missed while the worker was down. */
export const WEEKLY_REVIEW_INITIAL_DELAY_MS = 10_000;

export function isWeeklyReviewEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env['WEEKLY_REVIEW_ENABLED']?.trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export function weeklyReviewIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env['WEEKLY_REVIEW_INTERVAL_MS'];
  if (raw === undefined || raw.trim() === '') return WEEKLY_REVIEW_DEFAULT_INTERVAL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= WEEKLY_REVIEW_MIN_INTERVAL_MS
    ? n
    : WEEKLY_REVIEW_DEFAULT_INTERVAL_MS;
}

export interface IWeeklyReviewScheduleHandle {
  stop(): void;
}

export interface IWeeklyReviewScheduleOptions {
  /** Web origin for deep links in the push and emails. */
  readonly webOrigin: string;
  readonly env?: NodeJS.ProcessEnv;
  /** Tests inject a fake tick; production builds a WeeklyReviewSender on the database. */
  readonly runTick?: () => Promise<IWeeklyReviewTickResult>;
  readonly initialDelayMs?: number;
}

export function startWeeklyReviewSchedule(
  database: Db,
  queue: IWeeklyReviewQueue,
  options: IWeeklyReviewScheduleOptions
): IWeeklyReviewScheduleHandle | null {
  const env = options.env ?? process.env;
  if (!isWeeklyReviewEnabled(env)) {
    logger.info({ job: 'weekly-review' }, 'weekly review schedule off (WEEKLY_REVIEW_ENABLED)');
    return null;
  }
  const runTick =
    options.runTick ??
    ((): Promise<IWeeklyReviewTickResult> =>
      new WeeklyReviewSender({ database, queue, webOrigin: options.webOrigin }).runTick());
  const tick = async (): Promise<void> => {
    const result = await runTick();
    logger.info({ ...result, job: 'weekly-review' }, 'weekly review tick');
  };
  const initial = setTimeout(() => {
    void tick().catch((err: unknown) => {
      logger.error({ err, job: 'weekly-review' }, 'weekly review catch-up tick failed');
    });
  }, options.initialDelayMs ?? WEEKLY_REVIEW_INITIAL_DELAY_MS);
  const interval = safeInterval('weekly-review', tick, weeklyReviewIntervalMs(env));
  logger.info(
    { intervalMs: weeklyReviewIntervalMs(env), job: 'weekly-review' },
    'weekly review schedule started'
  );
  return {
    stop: (): void => {
      clearTimeout(initial);
      clearInterval(interval);
    },
  };
}
