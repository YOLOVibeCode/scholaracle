import { enqueueGuidanceJobs } from './enqueueGuidanceJobs';
import type { ILadderAssignment } from '@scholaracle/studio-core';
import type { MongoQueue } from '../queue/MongoQueue';

describe('enqueueGuidanceJobs', () => {
  it('adds future ladder steps onto MongoQueue with scheduledFor', async () => {
    const add = jest.fn().mockResolvedValue('job-id');
    const queue = { add } as unknown as MongoQueue;
    const due = new Date('2026-08-27T16:00:00.000Z');
    const assignment: ILadderAssignment = {
      studentId: 'emma-id',
      assignmentExternalId: 'demo-emma-ap-bio-a5',
      title: 'Cell Division',
      dueAt: due,
      timezone: 'America/New_York',
    };
    const now = new Date(due.getTime() - 80 * 60 * 60 * 1000);
    const ids = await enqueueGuidanceJobs(queue, assignment, now);
    expect(ids).toHaveLength(4);
    expect(add).toHaveBeenCalledTimes(4);
    expect(add.mock.calls[0]?.[0]).toBe('guidance');
    expect(add.mock.calls[0]?.[3]).toEqual(
      expect.objectContaining({ scheduledFor: expect.any(Date) })
    );
  });
});
