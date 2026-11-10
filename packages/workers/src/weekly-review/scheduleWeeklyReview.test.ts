import type { Db } from 'mongodb';
import type { IWeeklyReviewQueue, IWeeklyReviewTickResult } from '@scholaracle/agents';
import {
  WEEKLY_REVIEW_DEFAULT_INTERVAL_MS,
  isWeeklyReviewEnabled,
  startWeeklyReviewSchedule,
  weeklyReviewIntervalMs,
} from './scheduleWeeklyReview';

const RESULT: IWeeklyReviewTickResult = {
  considered: 2,
  sent: 1,
  noRecipients: 0,
  alreadySent: 1,
  failed: 0,
};

const queue: IWeeklyReviewQueue = { add: jest.fn().mockResolvedValue('job-1') };

describe('isWeeklyReviewEnabled (default off)', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['0', false],
    ['no', false],
    ['maybe', false],
    ['true', true],
    ['TRUE', true],
    [' true ', true],
    ['1', true],
    ['yes', true],
  ])('WEEKLY_REVIEW_ENABLED=%p → %p', (raw, expected) => {
    const env: NodeJS.ProcessEnv = raw === undefined ? {} : { WEEKLY_REVIEW_ENABLED: raw };
    expect(isWeeklyReviewEnabled(env)).toBe(expected);
  });
});

describe('weeklyReviewIntervalMs', () => {
  it('defaults to 15 minutes and refuses anything under a minute or unparseable', () => {
    expect(weeklyReviewIntervalMs({})).toBe(15 * 60_000);
    expect(WEEKLY_REVIEW_DEFAULT_INTERVAL_MS).toBe(15 * 60_000);
    expect(weeklyReviewIntervalMs({ WEEKLY_REVIEW_INTERVAL_MS: '120000' })).toBe(120_000);
    expect(weeklyReviewIntervalMs({ WEEKLY_REVIEW_INTERVAL_MS: '5000' })).toBe(15 * 60_000);
    expect(weeklyReviewIntervalMs({ WEEKLY_REVIEW_INTERVAL_MS: 'soon' })).toBe(15 * 60_000);
    expect(weeklyReviewIntervalMs({ WEEKLY_REVIEW_INTERVAL_MS: '  ' })).toBe(15 * 60_000);
  });
});

describe('startWeeklyReviewSchedule', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('returns null and never ticks when the flag is off', async () => {
    jest.useFakeTimers();
    const runTick = jest.fn().mockResolvedValue(RESULT);
    const handle = startWeeklyReviewSchedule({} as Db, queue, {
      webOrigin: 'https://x.test',
      env: {},
      runTick,
    });
    expect(handle).toBeNull();
    await jest.advanceTimersByTimeAsync(60 * 60_000);
    expect(runTick).not.toHaveBeenCalled();
  });

  it('runs a catch-up tick after the initial delay, then every 15 minutes', async () => {
    jest.useFakeTimers();
    const runTick = jest.fn().mockResolvedValue(RESULT);
    const handle = startWeeklyReviewSchedule({} as Db, queue, {
      webOrigin: 'https://x.test',
      env: { WEEKLY_REVIEW_ENABLED: 'true' },
      runTick,
      initialDelayMs: 1_000,
    });
    expect(handle).not.toBeNull();

    await jest.advanceTimersByTimeAsync(999);
    expect(runTick).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(runTick).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(15 * 60_000 - 1_000);
    expect(runTick).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(15 * 60_000);
    expect(runTick).toHaveBeenCalledTimes(3);

    handle?.stop();
    await jest.advanceTimersByTimeAsync(60 * 60_000);
    expect(runTick).toHaveBeenCalledTimes(3);
  });

  it('honours WEEKLY_REVIEW_INTERVAL_MS and survives a failing tick', async () => {
    jest.useFakeTimers();
    const runTick = jest
      .fn()
      .mockRejectedValueOnce(new Error('mongo hiccup'))
      .mockResolvedValue(RESULT);
    const handle = startWeeklyReviewSchedule({} as Db, queue, {
      webOrigin: 'https://x.test',
      env: { WEEKLY_REVIEW_ENABLED: '1', WEEKLY_REVIEW_INTERVAL_MS: '60000' },
      runTick,
      initialDelayMs: 0,
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(runTick).toHaveBeenCalledTimes(1); // the rejected catch-up tick
    await jest.advanceTimersByTimeAsync(60_000);
    expect(runTick).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(runTick).toHaveBeenCalledTimes(3);
    handle?.stop();
  });

  it('stop() before the first tick cancels the catch-up too', async () => {
    jest.useFakeTimers();
    const runTick = jest.fn().mockResolvedValue(RESULT);
    const handle = startWeeklyReviewSchedule({} as Db, queue, {
      webOrigin: 'https://x.test',
      env: { WEEKLY_REVIEW_ENABLED: 'yes' },
      runTick,
      initialDelayMs: 5_000,
    });
    handle?.stop();
    await jest.advanceTimersByTimeAsync(60 * 60_000);
    expect(runTick).not.toHaveBeenCalled();
  });
});
