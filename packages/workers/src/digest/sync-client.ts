/**
 * Sync client implementations (ISP — M2, TDD — M1).
 * Small, focused classes implementing single-responsibility interfaces.
 */

import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { ISyncTrigger, ISyncStatusPoller, IStudentRecipientResolver } from './interfaces';

export class SyncTrigger implements ISyncTrigger {
  constructor(
    private readonly _apiUrl: string,
    private readonly _token: string
  ) {}

  async triggerAllForStudent(studentId: string): Promise<{ jobIds: string[] }> {
    const url = `${this._apiUrl.replace(/\/$/, '')}/api/sync/students/${studentId}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this._token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Trigger sync failed ${res.status}: ${body}`);
    }
    const data = (await res.json()) as { jobIds?: string[] };
    return { jobIds: data.jobIds ?? [] };
  }
}

export class SyncStatusPoller implements ISyncStatusPoller {
  constructor(
    private readonly _apiUrl: string,
    private readonly _token: string
  ) {}

  async getRuns(
    studentId: string,
    limit: number
  ): Promise<ReadonlyArray<{ status: string; createdAt: string }>> {
    const url = `${this._apiUrl.replace(/\/$/, '')}/api/sync/students/${studentId}/runs?limit=${limit}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this._token}`,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Get runs failed ${res.status}: ${body}`);
    }
    const data = (await res.json()) as { runs: ReadonlyArray<{ status: string; createdAt: string }> };
    return data.runs;
  }
}

export class StudentRecipientResolver implements IStudentRecipientResolver {
  constructor(private readonly _database: Db) {}

  async resolveRecipients(studentId: string): Promise<string[]> {
    const student = await this._database
      .collection('students')
      .findOne({ _id: new ObjectId(studentId) });
    if (!student) return [];

    const ownerId = (student['userId'] as unknown)?.toString?.();
    const shared = (student['sharedWith'] as Array<{ userId?: string; status?: string }>) ?? [];
    const userIds: string[] = ownerId ? [ownerId] : [];
    for (const s of shared) {
      if (s.status === 'accepted' && s.userId) userIds.push(s.userId);
    }
    return userIds;
  }
}
