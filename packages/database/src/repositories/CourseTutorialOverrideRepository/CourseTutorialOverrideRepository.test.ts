import { MongoClient, type Db } from 'mongodb';
import { CourseTutorialOverrideRepository } from './CourseTutorialOverrideRepository';

describe('CourseTutorialOverrideRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repo: CourseTutorialOverrideRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repo = new CourseTutorialOverrideRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('course_tutorial_overrides').deleteMany({});
  });

  it('upserts manual tutorial and deletes on reset', async () => {
    await repo.upsertManual({
      userId: 'user-1',
      studentId: 'stu-1',
      mergedCourseId: 'merged-alg',
      tutorialWindow: 'Wed 8:00 AM',
    });
    const found = await repo.findByStudentAndMergedCourse({
      userId: 'user-1',
      studentId: 'stu-1',
      mergedCourseId: 'merged-alg',
    });
    expect(found?.tutorialWindow).toBe('Wed 8:00 AM');

    const isDeleted = await repo.deleteByStudentAndMergedCourse({
      userId: 'user-1',
      studentId: 'stu-1',
      mergedCourseId: 'merged-alg',
    });
    expect(isDeleted).toBe(true);
    const after = await repo.findByStudentAndMergedCourse({
      userId: 'user-1',
      studentId: 'stu-1',
      mergedCourseId: 'merged-alg',
    });
    expect(after).toBeNull();
  });
});
