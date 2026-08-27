import { randomBytes } from 'node:crypto';
import { ConflictError, NotFoundError, ValidationError } from '@scholaracle/contracts';
import {
  UserRepository,
  type IStudentLogin,
  type Student,
  type StudentRepository,
  type User,
} from '@scholaracle/database';
import type {
  IStudentInviteResult,
  IStudentLoginAudit,
  IStudentLoginAuditEvent,
  IStudentLoginStatus,
  IStudentProvisioner,
} from '@scholaracle/interfaces';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export interface IStudentProvisionerDeps {
  readonly studentRepository: StudentRepository;
  readonly userRepository: UserRepository;
  readonly audit?: IStudentLoginAudit;
}

function generateTemporaryPassword(): string {
  const bytes = randomBytes(12);
  let body = '';
  for (const byte of bytes) {
    const index = byte % TEMP_PASSWORD_ALPHABET.length;
    const ch = TEMP_PASSWORD_ALPHABET[index];
    if (ch !== undefined) {
      body += ch;
    }
  }
  return `${body}Aa1!`;
}

function normalizeEmail(email: string | undefined): string | undefined {
  if (email === undefined) {
    return undefined;
  }
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class StudentProvisioner implements IStudentProvisioner {
  private readonly _students: StudentRepository;
  private readonly _users: UserRepository;
  private readonly _audit: IStudentLoginAudit | undefined;

  constructor(deps: IStudentProvisionerDeps) {
    this._students = deps.studentRepository;
    this._users = deps.userRepository;
    this._audit = deps.audit;
  }

  public async getStatus(studentId: string): Promise<IStudentLoginStatus> {
    const student = await this._requireStudent(studentId);
    const bound = student.studentLogin;
    if (bound !== undefined) {
      const user = await this._users.findById(bound.userId);
      return {
        provisioned: true,
        email: user?.email,
        showGrades: bound.showGrades === true,
        createdAt: bound.createdAt,
        userId: bound.userId,
      };
    }
    const leftover = await this._users.findByStudentId(studentId);
    return {
      provisioned: false,
      showGrades: false,
      email: leftover?.email,
    };
  }

  public async invite(studentId: string, email?: string): Promise<IStudentInviteResult> {
    const student = await this._requireStudent(studentId);
    const existing = await this._users.findByStudentId(studentId);
    if (existing !== null) {
      return this._resetExisting(existing, student, studentId);
    }

    const normalized = normalizeEmail(email);
    if (normalized === undefined) {
      throw new ValidationError('Email is required to create a student login');
    }
    if (!EMAIL_PATTERN.test(normalized)) {
      throw new ValidationError('Enter a valid email address');
    }

    const taken = await this._users.findByEmail(normalized);
    if (taken !== null) {
      throw new ConflictError('That email is already in use');
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await UserRepository.hashPassword(temporaryPassword);
    const user = await this._users.create({
      email: normalized,
      passwordHash,
      name: student.name,
      role: 'student',
      studentId,
    });
    const userId = user._id?.toString();
    if (userId === undefined) {
      throw new Error('Failed to create student login');
    }

    await this._students.update(studentId, {
      studentLogin: this._loginBinding(student, userId, false, new Date()),
    });

    await this._record({
      studentId,
      actorUserId: student.userId.toString(),
      action: 'invite',
      at: new Date(),
      metadata: { email: normalized },
    });

    return { email: normalized, temporaryPassword };
  }

  public async revoke(userId: string): Promise<void> {
    const user = await this._users.findById(userId);
    if (user === null || user.role !== 'student') {
      throw new NotFoundError('Student login not found');
    }
    const studentId = user.studentId;
    let actorUserId = '';
    if (studentId !== undefined && studentId !== '') {
      const student = await this._requireStudent(studentId).catch(() => null);
      actorUserId = student?.userId.toString() ?? '';
    }
    await this._users.suspendUser(userId, 'student_login_revoked');
    if (studentId !== undefined && studentId !== '') {
      await this._students.clearStudentLogin(studentId);
      await this._record({
        studentId,
        actorUserId,
        action: 'revoke',
        at: new Date(),
      });
    }
  }

  public async setShowGrades(studentId: string, showGrades: boolean): Promise<void> {
    const student = await this._requireStudent(studentId);
    if (student.studentLogin === undefined) {
      throw new NotFoundError('Student login not found');
    }
    await this._students.update(studentId, {
      studentLogin: this._loginBinding(
        student,
        student.studentLogin.userId,
        showGrades,
        student.studentLogin.createdAt
      ),
    });
    await this._record({
      studentId,
      actorUserId: student.userId.toString(),
      action: 'set_show_grades',
      at: new Date(),
      metadata: { showGrades },
    });
  }

  private async _requireStudent(studentId: string): Promise<Student> {
    let student: Student | null;
    try {
      student = await this._students.findById(studentId);
    } catch {
      throw new NotFoundError('Student not found');
    }
    if (student === null) {
      throw new NotFoundError('Student not found');
    }
    return student;
  }

  private async _resetExisting(
    existing: User,
    student: Student,
    studentId: string
  ): Promise<IStudentInviteResult> {
    const userId = existing._id?.toString();
    if (userId === undefined) {
      throw new Error('Student login is missing an id');
    }
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await UserRepository.hashPassword(temporaryPassword);
    await this._users.update(userId, {
      passwordHash,
      role: 'student',
      studentId,
    });
    if (existing.isSuspended) {
      await this._users.unsuspendUser(userId);
    }
    await this._students.update(studentId, {
      studentLogin: this._loginBinding(
        student,
        userId,
        student.studentLogin?.showGrades === true,
        student.studentLogin?.createdAt ?? existing.createdAt
      ),
    });
    await this._record({
      studentId,
      actorUserId: student.userId.toString(),
      action: 'invite',
      at: new Date(),
      metadata: { email: existing.email, reset: true },
    });
    return { email: existing.email, temporaryPassword };
  }

  private _loginBinding(
    student: Student,
    userId: string,
    showGrades: boolean,
    createdAt: Date
  ): IStudentLogin {
    return {
      userId,
      showGrades,
      createdAt,
      provisionedByUserId: student.studentLogin?.provisionedByUserId ?? student.userId.toString(),
    };
  }

  private async _record(event: IStudentLoginAuditEvent): Promise<void> {
    if (this._audit === undefined) {
      return;
    }
    await this._audit.record(event);
  }
}
