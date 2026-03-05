/**
 * Tests for sync trigger and poller (TDD — M1).
 * RED phase: tests first, implementation follows.
 */

import { SyncTrigger, SyncStatusPoller, StudentRecipientResolver } from './sync-client';
import type { Db } from 'mongodb';

describe('SyncTrigger', () => {
  it('should call API to trigger sync for all sources', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobIds: ['job-1', 'job-2'] }),
    });
    global.fetch = mockFetch as never;

    const trigger = new SyncTrigger('http://localhost:3000', 'token-123');
    const result = await trigger.triggerAllForStudent('student-abc');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/sync/students/student-abc',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      })
    );
    expect(result.jobIds).toEqual(['job-1', 'job-2']);
  });

  it('should throw when API returns non-200', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });
    global.fetch = mockFetch as never;

    const trigger = new SyncTrigger('http://localhost:3000', 'token-123');
    await expect(trigger.triggerAllForStudent('student-abc')).rejects.toThrow(
      'Trigger sync failed 400: Bad Request'
    );
  });
});

describe('SyncStatusPoller', () => {
  it('should call API to get runs for a student', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        runs: [
          { status: 'completed', createdAt: '2026-03-02T10:00:00Z' },
          { status: 'running', createdAt: '2026-03-02T09:00:00Z' },
        ],
      }),
    });
    global.fetch = mockFetch as never;

    const poller = new SyncStatusPoller('http://localhost:3000', 'token-123');
    const runs = await poller.getRuns('student-abc', 10);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/sync/students/student-abc/runs?limit=10',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      })
    );
    expect(runs).toHaveLength(2);
    expect(runs[0]?.status).toBe('completed');
  });

  it('should throw when API returns non-200', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });
    global.fetch = mockFetch as never;

    const poller = new SyncStatusPoller('http://localhost:3000', 'token-123');
    await expect(poller.getRuns('student-abc', 10)).rejects.toThrow(
      'Get runs failed 404: Not Found'
    );
  });
});

describe('StudentRecipientResolver', () => {
  const validStudentId = '507f1f77bcf86cd799439011';

  it('should return owner and accepted contacts for a student', async () => {
    const mockDb = {
      collection: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue({
          userId: 'owner-user-id',
          sharedWith: [
            { userId: 'contact-1', status: 'accepted' },
            { userId: 'contact-2', status: 'pending' },
            { userId: 'contact-3', status: 'accepted' },
          ],
        }),
      }),
    } as unknown as Db;

    const resolver = new StudentRecipientResolver(mockDb);
    const userIds = await resolver.resolveRecipients(validStudentId);

    expect(userIds).toEqual(['owner-user-id', 'contact-1', 'contact-3']);
  });

  it('should return only owner when no accepted contacts exist', async () => {
    const mockDb = {
      collection: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue({
          userId: 'owner-user-id',
          sharedWith: [{ userId: 'contact-1', status: 'pending' }],
        }),
      }),
    } as unknown as Db;

    const resolver = new StudentRecipientResolver(mockDb);
    const userIds = await resolver.resolveRecipients(validStudentId);

    expect(userIds).toEqual(['owner-user-id']);
  });

  it('should return empty array when student not found', async () => {
    const mockDb = {
      collection: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(null),
      }),
    } as unknown as Db;

    const resolver = new StudentRecipientResolver(mockDb);
    const userIds = await resolver.resolveRecipients(validStudentId);

    expect(userIds).toEqual([]);
  });
});
