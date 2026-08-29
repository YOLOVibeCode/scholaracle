import { createHash } from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';
import { StudentRepository, UserRepository } from '@scholaracle/database';
import { NotFoundError } from '@scholaracle/contracts';
import { StudentProvisioner } from './StudentProvisioner';
import { MagicLoginLink, SENT_MAGIC_TTL_MS } from './MagicLoginLink';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function tokenFromLoginUrl(loginUrl: string): string {
  const parsed = new URL(loginUrl);
  const token = parsed.searchParams.get('token');
  if (token === null) throw new Error('loginUrl missing token param');
  return token;
}

describe('MagicLoginLink', () => {
  let client: MongoClient;
  let database: Db;
  let students: StudentRepository;
  let users: UserRepository;
  let provisioner: StudentProvisioner;
  let studentId: string;
  let parentUserId: string;
  let qrPayloads: string[];

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_magic_login_link_test');
    students = new StudentRepository(database);
    users = new UserRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('students').deleteMany({});
    await database.collection('users').deleteMany({});
    await database.collection('magic_login_tokens').deleteMany({});

    const parentHash = await UserRepository.hashPassword('ParentPass123!');
    const parent = await users.create({
      email: 'owner.magic@example.com',
      passwordHash: parentHash,
      name: 'Owner',
      role: 'parent',
    });
    parentUserId = parent._id?.toString() ?? '';
    const student = await students.create({
      userId: parentUserId,
      name: 'Nora Magic',
      grade: 8,
    });
    studentId = student._id?.toString() ?? '';
    provisioner = new StudentProvisioner({ studentRepository: students, userRepository: users });
    qrPayloads = [];
  });

  function issuer(now?: () => Date): MagicLoginLink {
    return new MagicLoginLink({
      database,
      baseUrl: 'http://test.example/',
      now,
      qr: async (text: string): Promise<string> => {
        qrPayloads.push(text);
        return `data:image/png;base64,${Buffer.from(text).toString('base64')}`;
      },
    });
  }

  // ── student kind ─────────────────────────────────────────────────────────

  describe('student kind', () => {
    it('issues a /magic?token= URL, QR, and stores only SHA-256 hash', async () => {
      await provisioner.invite(studentId, 'nora@example.com');
      const issued = await issuer().issueForStudent(studentId);

      expect(issued.loginUrl).toMatch(/^http:\/\/test\.example\/magic\?token=/);
      expect(issued.qrDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(qrPayloads).toEqual([issued.loginUrl]);

      const raw = tokenFromLoginUrl(issued.loginUrl);
      const stored = await database.collection('magic_login_tokens').find({}).toArray();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.['kind']).toBe('student');
      expect(stored[0]?.['tokenHash']).toBe(sha256(raw));
      expect(stored[0]?.['token']).toBeUndefined();
      expect(JSON.stringify(stored)).not.toContain(raw);
    });

    it('throws NotFoundError when the student has no login', async () => {
      await expect(issuer().issueForStudent(studentId)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('invalidates the previous unused token on re-issue', async () => {
      await provisioner.invite(studentId, 'nora@example.com');
      const magic = issuer();
      const first = await magic.issueForStudent(studentId);
      const second = await magic.issueForStudent(studentId);

      expect(await magic.consume(tokenFromLoginUrl(first.loginUrl))).toBeNull();
      const result = await magic.consume(tokenFromLoginUrl(second.loginUrl));
      expect(result).not.toBeNull();
      expect('userId' in result!).toBe(true);
    });

    it('consume is single-use', async () => {
      await provisioner.invite(studentId, 'nora@example.com');
      const magic = issuer();
      const issued = await magic.issueForStudent(studentId);
      const raw = tokenFromLoginUrl(issued.loginUrl);

      const first = await magic.consume(raw);
      expect(first !== null && 'userId' in first).toBe(true);
      expect(await magic.consume(raw)).toBeNull();
    });

    it('consume returns null for expired tokens', async () => {
      const frozen = new Date('2026-08-25T21:00:00.000Z');
      await provisioner.invite(studentId, 'nora@example.com');
      const expiredIssuer = issuer(() => frozen);
      await provisioner.invite(studentId, 'nora@example.com');
      const expired = await expiredIssuer.issueForStudent(studentId);
      const late = issuer(() => new Date(frozen.getTime() + 16 * 60 * 1000));
      expect(await late.consume(tokenFromLoginUrl(expired.loginUrl))).toBeNull();
    });
  });

  // ── sharedParent (accepted) kind ─────────────────────────────────────────

  describe('sharedParent kind (accepted contact)', () => {
    let contactUserId: string;

    beforeEach(async () => {
      const hash = await UserRepository.hashPassword('ContactPass123!');
      const contact = await users.create({
        email: 'contact@example.com',
        passwordHash: hash,
        name: 'Contact',
        role: 'parent',
      });
      contactUserId = contact._id?.toString() ?? '';
    });

    it('issues a sent link (24h TTL) and consume returns userId', async () => {
      const magic = issuer();
      const issued = await magic.issueForContact(studentId, contactUserId, null);

      const raw = tokenFromLoginUrl(issued.loginUrl);
      const stored = await database.collection('magic_login_tokens').find({}).toArray();
      expect(stored[0]?.['kind']).toBe('sharedParent');
      expect(stored[0]?.['userId']).toBeDefined();

      const expiresInMs = issued.expiresAt.getTime() - Date.now();
      expect(expiresInMs).toBeGreaterThan(23 * 60 * 60 * 1000);
      expect(expiresInMs).toBeLessThanOrEqual(SENT_MAGIC_TTL_MS + 5000);

      const result = await magic.consume(raw);
      expect(result !== null && 'userId' in result).toBe(true);
      if (result && 'userId' in result) {
        expect(result.userId).toBe(contactUserId);
      }
    });

    it('invalidates prior unused tokens on re-issue', async () => {
      const magic = issuer();
      const first = await magic.issueForContact(studentId, contactUserId, null);
      const second = await magic.issueForContact(studentId, contactUserId, null);

      expect(await magic.consume(tokenFromLoginUrl(first.loginUrl))).toBeNull();
      expect(await magic.consume(tokenFromLoginUrl(second.loginUrl))).not.toBeNull();
    });
  });

  // ── sharedParent (pending invite) kind ───────────────────────────────────

  describe('sharedParent kind (pending invite)', () => {
    it('issues a pending-invite token and consume returns pendingInvite payload', async () => {
      const inviteEmail = 'pending@example.com';
      const magic = issuer();
      const issued = await magic.issueForContact(studentId, null, inviteEmail);

      const raw = tokenFromLoginUrl(issued.loginUrl);
      const stored = await database.collection('magic_login_tokens').find({}).toArray();
      expect(stored[0]?.['kind']).toBe('sharedParent');
      expect(stored[0]?.['userId']).toBeUndefined();
      expect(stored[0]?.['inviteEmail']).toBe(inviteEmail);

      const result = await magic.consume(raw);
      expect(result !== null && 'pendingInvite' in result!).toBe(true);
      if (result && 'pendingInvite' in result) {
        expect(result.pendingInvite.studentId).toBe(studentId);
        expect(result.pendingInvite.email).toBe(inviteEmail);
      }
    });

    it('invalidates prior pending-invite tokens on re-issue', async () => {
      const inviteEmail = 'pending@example.com';
      const magic = issuer();
      const first = await magic.issueForContact(studentId, null, inviteEmail);
      const second = await magic.issueForContact(studentId, null, inviteEmail);

      expect(await magic.consume(tokenFromLoginUrl(first.loginUrl))).toBeNull();
      expect(await magic.consume(tokenFromLoginUrl(second.loginUrl))).not.toBeNull();
    });

    it('consume returns null for unknown token', async () => {
      const magic = issuer();
      expect(await magic.consume('totally-fake-token')).toBeNull();
    });
  });

  it('never logs the raw token', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, 'MagicLoginLink.ts'),
      'utf8'
    ) as string;
    expect(src).not.toMatch(/console\.log/);
  });
});
