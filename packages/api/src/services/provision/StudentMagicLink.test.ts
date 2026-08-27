import { createHash } from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { StudentRepository, UserRepository } from '@scholaracle/database';
import { NotFoundError } from '@scholaracle/contracts';
import { StudentProvisioner } from './StudentProvisioner';
import { StudentMagicLink } from './StudentMagicLink';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function tokenFromLoginUrl(loginUrl: string): string {
  const parsed = new URL(loginUrl);
  const token = parsed.searchParams.get('magic');
  if (token === null) {
    throw new Error('loginUrl missing magic param');
  }
  return token;
}

describe('StudentMagicLink', () => {
  let client: MongoClient;
  let database: Db;
  let students: StudentRepository;
  let users: UserRepository;
  let provisioner: StudentProvisioner;
  let studentId: string;
  let qrPayloads: string[];

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_student_magic_link_test');
    students = new StudentRepository(database);
    users = new UserRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('students').deleteMany({});
    await database.collection('users').deleteMany({});
    await database.collection('student_magic_tokens').deleteMany({});
    const parentHash = await UserRepository.hashPassword('ParentPass123!');
    const parent = await users.create({
      email: 'owner.magic@example.com',
      passwordHash: parentHash,
      name: 'Owner',
      role: 'parent',
    });
    const student = await students.create({
      userId: parent._id?.toString() ?? '',
      name: 'Nora Magic',
      grade: 8,
    });
    studentId = student._id?.toString() ?? '';
    provisioner = new StudentProvisioner({
      studentRepository: students,
      userRepository: users,
    });
    qrPayloads = [];
  });

  function issuer(now?: () => Date): StudentMagicLink {
    return new StudentMagicLink({
      database,
      baseUrl: 'http://test.example/',
      now,
      qr: async (text: string): Promise<string> => {
        qrPayloads.push(text);
        return `data:image/png;base64,${Buffer.from(text).toString('base64')}`;
      },
    });
  }

  it('issues a /login?magic= URL, QR of that URL, and stores only the SHA-256 hash', async () => {
    await provisioner.invite(studentId, 'nora.magic@example.com');
    const issued = await issuer().issue(studentId);

    expect(issued.loginUrl).toMatch(/^http:\/\/test\.example\/login\?magic=/);
    expect(issued.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(qrPayloads).toEqual([issued.loginUrl]);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
    expect(issued.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000);

    const raw = tokenFromLoginUrl(issued.loginUrl);
    const stored = await database.collection('student_magic_tokens').find({}).toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.['tokenHash']).toBe(sha256(raw));
    expect(stored[0]?.['token']).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain(raw);
  });

  it('404s when the student has no login', async () => {
    await expect(issuer().issue(studentId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('invalidates the previous unused token on re-issue', async () => {
    await provisioner.invite(studentId, 'nora.magic@example.com');
    const magic = issuer();
    const first = await magic.issue(studentId);
    const second = await magic.issue(studentId);

    expect(await magic.consume(tokenFromLoginUrl(first.loginUrl))).toBeNull();
    expect(await magic.consume(tokenFromLoginUrl(second.loginUrl))).not.toBeNull();
  });

  it('consume is single-use and treats expired/unknown the same', async () => {
    await provisioner.invite(studentId, 'nora.magic@example.com');
    const magic = issuer();
    const issued = await magic.issue(studentId);
    const raw = tokenFromLoginUrl(issued.loginUrl);

    const first = await magic.consume(raw);
    expect(first?.userId).toBeDefined();
    expect(await magic.consume(raw)).toBeNull();
    expect(await magic.consume('unknown-token')).toBeNull();

    const frozen = new Date('2026-08-25T21:00:00.000Z');
    const expiredIssuer = issuer(() => frozen);
    const expired = await expiredIssuer.issue(studentId);
    const late = issuer(() => new Date(frozen.getTime() + 16 * 60 * 1000));
    expect(await late.consume(tokenFromLoginUrl(expired.loginUrl))).toBeNull();
  });

  it('never logs the raw token', () => {
    const src = fs.readFileSync(path.join(__dirname, 'StudentMagicLink.ts'), 'utf8');
    expect(src).not.toMatch(/console\.log/);
    expect(src).not.toMatch(/IStudentProvisioner/);
  });
});
