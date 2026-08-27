import { MongoClient, type Db } from 'mongodb';
import { MongoStudentLoginAudit, STUDENT_LOGIN_AUDIT_COLLECTION } from './MongoStudentLoginAudit';

describe('MongoStudentLoginAudit', () => {
  let client: MongoClient;
  let database: Db;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_login_audit_test');
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection(STUDENT_LOGIN_AUDIT_COLLECTION).deleteMany({});
  });

  it('records actorUserId and strips passwords from metadata', async () => {
    const audit = new MongoStudentLoginAudit(database);
    await audit.record({
      studentId: 'stu-1',
      actorUserId: 'parent-1',
      action: 'invite',
      at: new Date('2026-08-25T18:00:00Z'),
      metadata: {
        email: 'nora@example.com',
        temporaryPassword: 'SecretAa1!',
        password: 'nope',
        passwordHash: 'hash',
      },
    });

    const stored = await database.collection(STUDENT_LOGIN_AUDIT_COLLECTION).findOne({
      studentId: 'stu-1',
    });
    expect(stored?.['actorUserId']).toBe('parent-1');
    expect(stored?.['action']).toBe('invite');
    expect(stored?.['metadata']).toEqual({ email: 'nora@example.com' });
    expect(JSON.stringify(stored)).not.toMatch(/SecretAa1!/);
    expect(JSON.stringify(stored)).not.toMatch(/temporaryPassword/);
    expect(JSON.stringify(stored)).not.toMatch(/passwordHash/);
  });
});
