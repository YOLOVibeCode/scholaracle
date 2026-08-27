import { scheduleGuidanceJobsFromOps } from './scheduleFromIngest';
import type { MongoQueue } from '@scholaracle/agents';
import type { ISlcDeltaOp } from '@scholaracle/contracts';
import { ObjectId } from 'mongodb';

describe('scheduleGuidanceJobsFromOps', () => {
  it('enqueues ladder jobs for assignment upserts with dueAt', async () => {
    const add = jest.fn().mockResolvedValue('job-id');
    const studentOid = new ObjectId();
    const findOne = jest.fn().mockResolvedValue({ _id: studentOid, studentId: 'demo-emma' });
    const database = {
      collection: jest.fn().mockReturnValue({ findOne }),
    } as unknown as import('mongodb').Db;
    const ops: ISlcDeltaOp[] = [
      {
        op: 'upsert',
        entity: 'assignment',
        observedAt: new Date().toISOString(),
        key: {
          provider: 'demo',
          adapterId: 'com.scholaracle.demo',
          externalId: 'demo-emma-ap-bio-a5',
          studentExternalId: 'demo-emma',
        },
        record: {
          title: 'Cell Division',
          dueAt: new Date(Date.now() + 80 * 60 * 60 * 1000).toISOString(),
          status: 'missing',
        },
      } as ISlcDeltaOp,
    ];
    await scheduleGuidanceJobsFromOps({
      queue: { add } as unknown as MongoQueue,
      database,
      userId: new ObjectId().toString(),
      timezone: 'America/New_York',
      ops,
      now: new Date(),
    });
    expect(add).toHaveBeenCalled();
    expect(add.mock.calls[0]?.[0]).toBe('guidance');
  });

  it('no-ops without a queue', async () => {
    await scheduleGuidanceJobsFromOps({
      database: { collection: jest.fn() } as unknown as import('mongodb').Db,
      userId: 'u',
      timezone: 'America/New_York',
      ops: [],
    });
  });
});
