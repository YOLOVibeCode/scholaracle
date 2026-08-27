import { MongoClient, type Db } from 'mongodb';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { StudentRepository, UserRepository } from '@scholaracle/database';
import { ConflictError, NotFoundError, ValidationError } from '@scholaracle/contracts';
import type { IStudentLoginAudit, IStudentLoginAuditEvent } from '@scholaracle/interfaces';
import { StudentProvisioner } from './StudentProvisioner';

class RecordingAudit implements IStudentLoginAudit {
  public readonly events: IStudentLoginAuditEvent[] = [];

  public async record(event: IStudentLoginAuditEvent): Promise<void> {
    this.events.push(event);
  }
}

describe('StudentProvisioner', () => {
  let client: MongoClient;
  let database: Db;
  let provisioner: StudentProvisioner;
  let students: StudentRepository;
  let users: UserRepository;
  let studentId: string;
  let ownerUserId: string;
  let audit: RecordingAudit;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_provisioner_test');
    students = new StudentRepository(database);
    users = new UserRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('students').deleteMany({});
    await database.collection('users').deleteMany({});
    const parentHash = await UserRepository.hashPassword('ParentPass123!');
    const parent = await users.create({
      email: 'owner@example.com',
      passwordHash: parentHash,
      name: 'Owner',
      role: 'parent',
    });
    const student = await students.create({
      userId: parent._id?.toString() ?? '',
      name: 'Nora Test',
      grade: 8,
    });
    studentId = student._id?.toString() ?? '';
    ownerUserId = parent._id?.toString() ?? '';
    audit = new RecordingAudit();
    provisioner = new StudentProvisioner({
      studentRepository: students,
      userRepository: users,
      audit,
    });
  });

  it('rejects a first invite without email', async () => {
    await expect(provisioner.invite(studentId)).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an invite when the email is already a parent', async () => {
    await expect(provisioner.invite(studentId, 'owner@example.com')).rejects.toBeInstanceOf(
      ConflictError
    );
  });

  it('re-binds a revoked login on a later invite', async () => {
    const first = await provisioner.invite(studentId, 'nora@example.com');
    expect(first.email).toBe('nora@example.com');
    const status = await provisioner.getStatus(studentId);
    expect(status.userId).toBeDefined();
    await provisioner.revoke(status.userId ?? '');
    expect((await provisioner.getStatus(studentId)).provisioned).toBe(false);

    const again = await provisioner.invite(studentId);
    expect(again.email).toBe('nora@example.com');
    expect(again.temporaryPassword).not.toBe(first.temporaryPassword);
    expect((await provisioner.getStatus(studentId)).provisioned).toBe(true);
  });

  it('cannot set showGrades before a login exists', async () => {
    await expect(provisioner.setShowGrades(studentId, true)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('records the owner as provisionedByUserId and never logs or audits the password', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const debug = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    try {
      const first = await provisioner.invite(studentId, 'nora@example.com');
      const profile = await students.findById(studentId);
      expect(profile?.studentLogin?.provisionedByUserId).toBe(ownerUserId);
      expect(profile?.studentLogin?.showGrades).toBe(false);

      const created = await users.findByEmail('nora@example.com');
      expect(created?.forcePasswordReset).toBe(false);

      expect(audit.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            studentId,
            actorUserId: ownerUserId,
            action: 'invite',
          }),
        ])
      );
      expect(JSON.stringify(audit.events)).not.toContain(first.temporaryPassword);
      expect(JSON.stringify(audit.events)).not.toMatch(/temporaryPassword/);
      expect(JSON.stringify(log.mock.calls)).not.toContain(first.temporaryPassword);
      expect(JSON.stringify(info.mock.calls)).not.toContain(first.temporaryPassword);
      expect(JSON.stringify(debug.mock.calls)).not.toContain(first.temporaryPassword);
    } finally {
      log.mockRestore();
      info.mockRestore();
      debug.mockRestore();
    }
  });

  it('does not put console.log in the provisioner source', () => {
    const src = fs.readFileSync(path.join(__dirname, 'StudentProvisioner.ts'), 'utf8');
    expect(src).not.toMatch(/console\.(log|info|debug|warn)/);
  });
});
