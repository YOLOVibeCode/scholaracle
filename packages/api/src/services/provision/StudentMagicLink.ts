import { createHash, randomBytes } from 'node:crypto';
import type { Db } from 'mongodb';
import { qrPngDataUrl } from '@scholaracle/auth';
import { NotFoundError } from '@scholaracle/contracts';
import {
  StudentMagicTokenRepository,
  StudentRepository,
  UserRepository,
  type IStudentMagicTokenStore,
} from '@scholaracle/database';
import type { IStudentMagicLink, IStudentMagicLinkIssued } from '@scholaracle/interfaces';

export const STUDENT_MAGIC_TTL_MS = 15 * 60 * 1000;

export interface IStudentMagicLinkDeps {
  readonly database: Db;
  readonly baseUrl: string;
  readonly now?: () => Date;
  readonly ttlMs?: number;
  readonly qr?: (text: string) => Promise<string>;
  readonly tokens?: IStudentMagicTokenStore;
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * Parent-issued one-time iPad login tickets. Stores SHA-256 of the token only.
 */
export class StudentMagicLink implements IStudentMagicLink {
  private readonly _students: StudentRepository;
  private readonly _users: UserRepository;
  private readonly _tokens: IStudentMagicTokenStore;
  private readonly _baseUrl: string;
  private readonly _now: () => Date;
  private readonly _ttlMs: number;
  private readonly _qr: (text: string) => Promise<string>;

  constructor(deps: IStudentMagicLinkDeps) {
    this._students = new StudentRepository(deps.database);
    this._users = new UserRepository(deps.database);
    this._tokens = deps.tokens ?? new StudentMagicTokenRepository(deps.database);
    this._baseUrl = deps.baseUrl.replace(/\/$/, '');
    this._now = deps.now ?? ((): Date => new Date());
    this._ttlMs = deps.ttlMs ?? STUDENT_MAGIC_TTL_MS;
    this._qr = deps.qr ?? qrPngDataUrl;
  }

  public async issue(studentId: string): Promise<IStudentMagicLinkIssued> {
    const student = await this._students.findById(studentId);
    const bound = student?.studentLogin;
    if (student === null || bound === undefined) {
      throw new NotFoundError('Student login not found');
    }
    const user = await this._users.findById(bound.userId);
    if (user === null || user.isSuspended || user.role !== 'student') {
      throw new NotFoundError('Student login not found');
    }

    await this._tokens.invalidateUnusedForUser(bound.userId);
    const raw = randomBytes(32).toString('base64url');
    const expiresAt = new Date(this._now().getTime() + this._ttlMs);
    await this._tokens.create(bound.userId, hashToken(raw), expiresAt);

    const loginUrl = `${this._baseUrl}/login?magic=${encodeURIComponent(raw)}`;
    const qrDataUrl = await this._qr(loginUrl);
    return { loginUrl, expiresAt, qrDataUrl };
  }

  public async consume(rawToken: string): Promise<{ userId: string } | null> {
    return this._tokens.consumeValid(hashToken(rawToken), this._now());
  }
}
