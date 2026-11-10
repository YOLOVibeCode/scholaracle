import { MongoClient, ObjectId, type Db } from 'mongodb';
import { DEFAULT_STUDENT_TIME_ZONE, resolveStudentTimeZone } from './resolveStudentTimeZone';

describe('resolveStudentTimeZone', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017');
    await client.connect();
    db = client.db(`resolve_student_tz_${process.pid}`);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  beforeEach(async () => {
    await db.collection('users').deleteMany({});
  });

  async function household(opts: {
    readonly owner?: string;
    readonly login?: string;
  }): Promise<{ _id: ObjectId; userId: string }> {
    const ownerId = new ObjectId();
    const studentId = new ObjectId();
    await db.collection('users').insertOne({
      _id: ownerId,
      email: 'o@example.com',
      role: 'parent',
      ...(opts.owner !== undefined ? { timezone: opts.owner } : {}),
    });
    await db.collection('users').insertOne({
      _id: new ObjectId(),
      email: 's@logins.example',
      role: 'student',
      studentId: studentId.toString(),
      ...(opts.login !== undefined ? { timezone: opts.login } : {}),
    });
    return { _id: studentId, userId: ownerId.toString() };
  }

  it("prefers the student login's stored zone", async () => {
    const s = await household({ owner: 'Asia/Tokyo', login: 'America/Los_Angeles' });
    expect(await resolveStudentTimeZone(db, s)).toBe('America/Los_Angeles');
  });

  it("falls back to the owner's stored zone", async () => {
    const s = await household({ owner: 'Asia/Tokyo' });
    expect(await resolveStudentTimeZone(db, s)).toBe('Asia/Tokyo');
  });

  it('defaults to America/New_York when neither stores a zone (same as the User model)', async () => {
    const s = await household({});
    expect(await resolveStudentTimeZone(db, s)).toBe('America/New_York');
    expect(DEFAULT_STUDENT_TIME_ZONE).toBe('America/New_York');
  });

  it('skips junk and empty zones instead of throwing', async () => {
    const s = await household({ owner: 'Mars/Olympus', login: '' });
    expect(await resolveStudentTimeZone(db, s)).toBe('America/New_York');
    const t = await household({ owner: 'Europe/Berlin', login: 'Not/AZone' });
    expect(await resolveStudentTimeZone(db, t)).toBe('Europe/Berlin');
  });

  it('copes with a student that has no Mongo id yet and a non-ObjectId owner', async () => {
    expect(await resolveStudentTimeZone(db, { _id: undefined, userId: 'legacy-owner' })).toBe(
      'America/New_York'
    );
  });
});
