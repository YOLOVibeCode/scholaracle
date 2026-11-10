import type { Db } from 'mongodb';

jest.mock('./repair-nightly', () => ({
  runRepairNightly: jest.fn().mockResolvedValue(3),
}));

jest.mock('./workerRepairDeps', () => ({
  buildWorkerRepairDeps: jest.fn(() => ({
    billingUserId: 'platform',
    loadSkeleton: async () => null,
  })),
}));

import { runRepairNightly } from './repair-nightly';
import { startRepairNightlySchedule } from './scheduleRepairNightly';

describe('startRepairNightlySchedule', () => {
  const savedHour = process.env['REPAIR_NIGHTLY_UTC_HOUR'];

  afterEach(() => {
    jest.clearAllMocks();
    if (savedHour === undefined) {
      delete process.env['REPAIR_NIGHTLY_UTC_HOUR'];
    } else {
      process.env['REPAIR_NIGHTLY_UTC_HOUR'] = savedHour;
    }
    jest.useRealTimers();
  });

  it('returns null when REPAIR_NIGHTLY_UTC_HOUR is unset', () => {
    delete process.env['REPAIR_NIGHTLY_UTC_HOUR'];
    expect(startRepairNightlySchedule({} as Db)).toBeNull();
  });

  it('returns null when REPAIR_NIGHTLY_UTC_HOUR is blank', () => {
    process.env['REPAIR_NIGHTLY_UTC_HOUR'] = '   ';
    expect(startRepairNightlySchedule({} as Db)).toBeNull();
  });

  it('returns null when hour is invalid', () => {
    process.env['REPAIR_NIGHTLY_UTC_HOUR'] = '25';
    expect(startRepairNightlySchedule({} as Db)).toBeNull();
  });

  it('runs repair once per UTC day when the clock hits the configured hour', async () => {
    jest.useFakeTimers();
    process.env['REPAIR_NIGHTLY_UTC_HOUR'] = '12';
    const handle = startRepairNightlySchedule({} as Db);
    expect(handle).not.toBeNull();

    jest.setSystemTime(new Date('2026-03-01T12:01:00.000Z'));
    await jest.advanceTimersByTimeAsync(60_000);
    expect(runRepairNightly).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date('2026-03-01T12:05:00.000Z'));
    await jest.advanceTimersByTimeAsync(60_000);
    expect(runRepairNightly).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date('2026-03-02T12:01:00.000Z'));
    await jest.advanceTimersByTimeAsync(60_000);
    expect(runRepairNightly).toHaveBeenCalledTimes(2);

    if (handle) clearInterval(handle);
  });

  it('does not run repair outside the configured UTC hour', async () => {
    jest.useFakeTimers();
    process.env['REPAIR_NIGHTLY_UTC_HOUR'] = '12';
    const handle = startRepairNightlySchedule({} as Db);
    jest.setSystemTime(new Date('2026-03-01T11:01:00.000Z'));
    await jest.advanceTimersByTimeAsync(60_000);
    expect(runRepairNightly).not.toHaveBeenCalled();
    if (handle) clearInterval(handle);
  });

  it('logs when nightly repair throws', async () => {
    jest.useFakeTimers();
    (runRepairNightly as jest.Mock).mockRejectedValueOnce(new Error('repair blew up'));
    process.env['REPAIR_NIGHTLY_UTC_HOUR'] = '3';
    const handle = startRepairNightlySchedule({} as Db);
    jest.setSystemTime(new Date('2026-04-01T03:01:00.000Z'));
    await jest.advanceTimersByTimeAsync(60_000);
    expect(runRepairNightly).toHaveBeenCalled();
    if (handle) clearInterval(handle);
  });
});
