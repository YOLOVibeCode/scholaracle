import { MongoClient, ObjectId, type Db } from 'mongodb';
import { StudentRepository } from '@scholaracle/database';
import type { ISlcDeltaOp } from '@scholaracle/contracts';
import {
  assertIngestWithinStudentPlanLimit,
  countNewStudentsRequiredByIngestOps,
} from './studentPlanLimit';

describe('studentPlanLimit', () => {
  let client: MongoClient;
  let database: Db;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test_student_plan_limit');
  });

  afterAll(async () => {
    await database.dropDatabase();
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('students').deleteMany({});
  });

  const assignmentOp = (studentExternalId: string): ISlcDeltaOp => ({
    op: 'upsert',
    entity: 'assignment',
    key: {
      provider: 'canvas',
      adapterId: 'com.instructure.canvas',
      externalId: `ext-${studentExternalId}`,
      studentExternalId,
      institutionExternalId: 'inst-1',
      courseExternalId: 'course-1',
    },
    observedAt: new Date().toISOString(),
    record: { title: 'HW', dueAt: new Date().toISOString(), status: 'missing', pointsPossible: 10 },
  });

  it('counts new external ids not already stored', async () => {
    const userId = new ObjectId().toHexString();
    const repo = new StudentRepository(database);
    await repo.create({ userId, name: 'Kid A', studentId: 'kid-a', dataSources: [] });

    const newCount = await countNewStudentsRequiredByIngestOps(database, userId, [
      assignmentOp('kid-a'),
      assignmentOp('kid-b'),
    ]);
    expect(newCount).toBe(1);
  });

  it('throws PLAN_LIMIT when a free account would exceed the cap', async () => {
    const userId = new ObjectId().toHexString();
    const repo = new StudentRepository(database);
    await repo.create({ userId, name: 'Kid A', studentId: 'kid-a', dataSources: [] });

    await expect(
      assertIngestWithinStudentPlanLimit(database, userId, [assignmentOp('kid-b')])
    ).rejects.toMatchObject({
      code: 'PLAN_LIMIT',
      currentCount: 1,
      maxStudents: 1,
    });
  });
});
