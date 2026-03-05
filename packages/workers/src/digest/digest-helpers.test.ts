/**
 * Tests for digest helper functions (TDD — M1).
 * RED phase: tests written first, implementation follows.
 */

import type { Db } from 'mongodb';
import { isInHoliday, getActiveSlotsForUser, shouldFlushLegacy } from './digest-helpers';

describe('isInHoliday', () => {
  it('should return false when no academic terms exist', async () => {
    const mockDb = {
      collection: jest.fn().mockReturnValue({
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([]),
        }),
      }),
    } as unknown as Db;

    const result = await isInHoliday(mockDb, 'user-123', '2026-03-15');
    expect(result).toBe(false);
  });

  it('should return false when date is within a term', async () => {
    const mockDb = {
      collection: jest.fn().mockReturnValue({
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([
            {
              record: { startDate: '2026-03-01', endDate: '2026-05-31' },
            },
          ]),
        }),
      }),
    } as unknown as Db;

    const result = await isInHoliday(mockDb, 'user-123', '2026-03-15');
    expect(result).toBe(false);
  });

  it('should return true when date is in gap between terms', async () => {
    const mockDb = {
      collection: jest.fn().mockReturnValue({
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([
            { record: { startDate: '2026-01-05', endDate: '2026-02-28' } },
            { record: { startDate: '2026-03-20', endDate: '2026-05-30' } },
          ]),
        }),
      }),
    } as unknown as Db;

    const result = await isInHoliday(mockDb, 'user-123', '2026-03-10');
    expect(result).toBe(true);
  });

  it('should return true when date is before all terms', async () => {
    const mockDb = {
      collection: jest.fn().mockReturnValue({
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([
            { record: { startDate: '2026-03-01', endDate: '2026-05-31' } },
          ]),
        }),
      }),
    } as unknown as Db;

    const result = await isInHoliday(mockDb, 'user-123', '2026-02-01');
    expect(result).toBe(true);
  });

  it('should return true when date is after all terms', async () => {
    const mockDb = {
      collection: jest.fn().mockReturnValue({
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([
            { record: { startDate: '2026-03-01', endDate: '2026-05-31' } },
          ]),
        }),
      }),
    } as unknown as Db;

    const result = await isInHoliday(mockDb, 'user-123', '2026-06-15');
    expect(result).toBe(true);
  });
});

describe('getActiveSlotsForUser', () => {
  it('should return true when current time matches weekday slot and is school day', () => {
    const user = {
      preferences: {
        notifications: {
          digestSchedule: {
            weekdaySlots: [
              { time: '06:30', enabled: true },
              { time: '16:00', enabled: true },
            ],
            weekendSlots: [{ time: '08:00', enabled: true }],
            schoolDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
          },
        },
      },
    };

    const result = getActiveSlotsForUser(user, '06:30', 'mon');
    expect(result).toBe(true);
  });

  it('should return false when time matches but slot is disabled', () => {
    const user = {
      preferences: {
        notifications: {
          digestSchedule: {
            weekdaySlots: [{ time: '06:30', enabled: false }],
            schoolDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
          },
        },
      },
    };

    const result = getActiveSlotsForUser(user, '06:30', 'mon');
    expect(result).toBe(false);
  });

  it('should return true when current time matches weekend slot on weekend day', () => {
    const user = {
      preferences: {
        notifications: {
          digestSchedule: {
            weekdaySlots: [{ time: '06:30', enabled: true }],
            weekendSlots: [{ time: '08:00', enabled: true }],
            schoolDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
          },
        },
      },
    };

    const result = getActiveSlotsForUser(user, '08:00', 'sat');
    expect(result).toBe(true);
  });

  it('should return false when time does not match any slot', () => {
    const user = {
      preferences: {
        notifications: {
          digestSchedule: {
            weekdaySlots: [{ time: '06:30', enabled: true }],
            schoolDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
          },
        },
      },
    };

    const result = getActiveSlotsForUser(user, '10:00', 'mon');
    expect(result).toBe(false);
  });

  it('should return false when no slots are configured', () => {
    const user = {
      preferences: {
        notifications: {
          digestSchedule: {},
        },
      },
    };

    const result = getActiveSlotsForUser(user, '06:30', 'mon');
    expect(result).toBe(false);
  });
});

describe('shouldFlushLegacy', () => {
  it('should return true when current time is in digestTimes', () => {
    const user = {
      preferences: {
        notifications: {
          digestSchedule: {
            digestTimes: ['06:30', '16:00'],
          },
        },
      },
    };

    const result = shouldFlushLegacy(user, '06:30', 6);
    expect(result).toBe(true);
  });

  it('should return false when current time is not in digestTimes', () => {
    const user = {
      preferences: {
        notifications: {
          digestSchedule: {
            digestTimes: ['06:30', '16:00'],
          },
        },
      },
    };

    const result = shouldFlushLegacy(user, '10:00', 10);
    expect(result).toBe(false);
  });

  it('should return true when no digestTimes and current hour matches default DIGEST_UTC_HOUR (18)', () => {
    const user = {
      preferences: {
        notifications: {
          digestSchedule: {},
        },
      },
    };

    const result = shouldFlushLegacy(user, '18:00', 18);
    expect(result).toBe(true);
  });

  it('should return false when no digestTimes and current hour does not match default', () => {
    const user = {
      preferences: {
        notifications: {
          digestSchedule: {},
        },
      },
    };

    const result = shouldFlushLegacy(user, '10:00', 10);
    expect(result).toBe(false);
  });
});
