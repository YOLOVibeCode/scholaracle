import { createHash, randomBytes } from 'node:crypto';
import type { Db } from 'mongodb';
import { qrPngDataUrl } from '@scholaracle/auth';
import { NotFoundError } from '@scholaracle/contracts';
import {
  MagicLoginTokenRepository,
  StudentRepository,
  UserRepository,
  type IMagicLoginTokenStore,
} from '@scholaracle/database';

export const STUDENT_MAGIC_TTL_MS = 15 * 60 * 1000;
export const SENT_MAGIC_TTL_MS = 24 * 60 * 60 * 1000;

export interface IMagicLoginLinkIssued {
  readonly loginUrl: string;
  readonly expiresAt: Date;
  readonly qrDataUrl: string;
}

export type MagicConsumeResult =
  | { readonly userId: string }
  | { readonly pendingInvite: { readonly studentId: string; readonly email: string } }
  | null;

export interface IMagicLoginLinkDeps {
  readonly database: Db;
  readonly baseUrl: string;
  readonly now?: () => Date;
  readonly studentTtlMs?: number;
  readonly sentTtlMs?: number;
  readonly qr?: (text: string) => Promise<string>;
  readonly tokens?: IMagicLoginTokenStore;
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * Role-aware one-time magic login links.
 *
 * - issueForStudent: 15-min QR link for student accounts
 * - issueForContact: 24-h email/SMS link for accepted or pending-invite shared parents
 * - consume: returns userId (for bound accounts) or pendingInvite payload
 */
export class MagicLoginLink {
  private readonly _students: StudentRepository;
  private readonly _users: UserRepository;
  private readonly _tokens: IMagicLoginTokenStore;
  private readonly _baseUrl: string;
  private readonly _now: () => Date;
  private readonly _studentTtlMs: number;
  private readonly _sentTtlMs: number;
  private readonly _qr: (text: string) => Promise<string>;

  constructor(deps: IMagicLoginLinkDeps) {
    this._students = new StudentRepository(deps.database);
    this._users = new UserRepository(deps.database);
    this._tokens = deps.tokens ?? new MagicLoginTokenRepository(deps.database);
    this._baseUrl = deps.baseUrl.replace(/\/$/, '');
    this._now = deps.now ?? ((): Date => new Date());
    this._studentTtlMs = deps.studentTtlMs ?? STUDENT_MAGIC_TTL_MS;
    this._sentTtlMs = deps.sentTtlMs ?? SENT_MAGIC_TTL_MS;
    this._qr = deps.qr ?? qrPngDataUrl;
  }

  /**
   * Issue a short-lived (15 min) QR login link for a provisioned student account.
   */
  public async issueForStudent(studentId: string): Promise<IMagicLoginLinkIssued> {
    const student = await this._students.findById(studentId);
    const bound = student?.studentLogin;
    if (student === null || bound === undefined) {
      throw new NotFoundError('Student login not found');
    }
    const user = await this._users.findById(bound.userId);
    if (user === null || user.isSuspended || user.role !== 'student') {
      throw new NotFoundError('Student login not found');
    }

    await this._tokens.invalidateUnusedForUser('student', bound.userId);
    return this._mintToken(this._studentTtlMs, async (tokenHash, expiresAt) => {
      await this._tokens.createForUser('student', bound.userId, tokenHash, expiresAt);
    });
  }

  /**
   * Issue a long-lived (24 h) link for a shared-parent contact.
   *
   * @param studentId - The student the contact is linked to
   * @param userId    - The contact's user ID (null if invite is still pending)
   * @param inviteEmail - Required when userId is null (pending invite)
   */
  public async issueForContact(
    studentId: string,
    userId: string | null,
    inviteEmail: string | null
  ): Promise<IMagicLoginLinkIssued> {
    if (userId !== null) {
      await this._tokens.invalidateUnusedForUser('sharedParent', userId);
      return this._mintToken(this._sentTtlMs, async (tokenHash, expiresAt) => {
        await this._tokens.createForUser('sharedParent', userId, tokenHash, expiresAt);
      });
    }

    if (inviteEmail === null) {
      throw new Error('inviteEmail is required for pending-invite contacts');
    }
    await this._tokens.invalidateUnusedForPendingInvite(studentId, inviteEmail);
    return this._mintToken(this._sentTtlMs, async (tokenHash, expiresAt) => {
      await this._tokens.createForPendingInvite(studentId, inviteEmail, tokenHash, expiresAt);
    });
  }

  public async consume(rawToken: string): Promise<MagicConsumeResult> {
    return this._tokens.consumeValid(hashToken(rawToken), this._now());
  }

  private async _mintToken(
    ttlMs: number,
    store: (tokenHash: string, expiresAt: Date) => Promise<void>
  ): Promise<IMagicLoginLinkIssued> {
    const raw = randomBytes(32).toString('base64url');
    const expiresAt = new Date(this._now().getTime() + ttlMs);
    await store(hashToken(raw), expiresAt);
    const loginUrl = `${this._baseUrl}/login?magic=${encodeURIComponent(raw)}`;
    const qrDataUrl = await this._qr(loginUrl);
    return { loginUrl, expiresAt, qrDataUrl };
  }
}
