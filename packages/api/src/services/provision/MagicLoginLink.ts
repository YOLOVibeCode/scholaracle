import { createHash, randomBytes } from 'node:crypto';
import type { Db } from 'mongodb';
import { qrPngDataUrl } from '@scholaracle/auth';
import { NotFoundError } from '@scholaracle/contracts';
import {
  MagicLoginTokenRepository,
  StudentRepository,
  UserRepository,
  type IMagicLoginTokenStore,
  type MagicLoginConsumeResult,
} from '@scholaracle/database';

export const STUDENT_MAGIC_TTL_MS = 15 * 60 * 1000;
export const SENT_MAGIC_TTL_MS = 24 * 60 * 60 * 1000;
/** A sharing invitation link lives 7 days (sharing-spec §4.7). */
export const INVITE_GROUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface IMagicLoginLinkIssued {
  readonly loginUrl: string;
  readonly expiresAt: Date;
  readonly qrDataUrl: string;
}

export type MagicConsumeResult = MagicLoginConsumeResult;

export interface IMagicLoginLinkDeps {
  readonly database: Db;
  readonly baseUrl: string;
  readonly now?: () => Date;
  readonly studentTtlMs?: number;
  readonly sentTtlMs?: number;
  readonly inviteGroupTtlMs?: number;
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
  private readonly _inviteGroupTtlMs: number;
  private readonly _qr: (text: string) => Promise<string>;

  constructor(deps: IMagicLoginLinkDeps) {
    this._students = new StudentRepository(deps.database);
    this._users = new UserRepository(deps.database);
    this._tokens = deps.tokens ?? new MagicLoginTokenRepository(deps.database);
    this._baseUrl = deps.baseUrl.replace(/\/$/, '');
    this._now = deps.now ?? ((): Date => new Date());
    this._studentTtlMs = deps.studentTtlMs ?? STUDENT_MAGIC_TTL_MS;
    this._sentTtlMs = deps.sentTtlMs ?? SENT_MAGIC_TTL_MS;
    this._inviteGroupTtlMs = deps.inviteGroupTtlMs ?? INVITE_GROUP_TTL_MS;
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
      // Links are per student: a fresh link for Christian must not kill the one for Ava.
      await this._tokens.invalidateUnusedForUser('sharedParent', userId, studentId);
      return this._mintToken(this._sentTtlMs, async (tokenHash, expiresAt) => {
        await this._tokens.createForUser('sharedParent', userId, tokenHash, expiresAt, studentId);
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

  /**
   * Issue the 7-day link of one sharing invitation: bound to the invited email and every student
   * in the group. Earlier unused links of the same group are dropped first (re-send semantics).
   */
  public async issueForInviteGroup(
    inviteEmail: string,
    studentIds: readonly string[],
    inviteGroupId: string
  ): Promise<IMagicLoginLinkIssued> {
    await this._tokens.invalidateUnusedForInviteGroup(inviteGroupId);
    return this._mintToken(this._inviteGroupTtlMs, async (tokenHash, expiresAt) => {
      await this._tokens.createForInviteGroup(
        inviteEmail,
        studentIds,
        tokenHash,
        expiresAt,
        inviteGroupId
      );
    });
  }

  /** Drop every unused invitation link (group or legacy per-student) for this email + student. */
  public async invalidateInviteTokens(inviteEmail: string, studentId: string): Promise<void> {
    await this._tokens.invalidateUnusedForInviteEmailAndStudent(inviteEmail, studentId);
  }

  /**
   * Drop the unused 24-h sign-in links an accepted shared adult holds for ONE student (removal /
   * leave). Links issued for other students stay valid; legacy links without a student go too.
   */
  public async invalidateContactLoginTokens(userId: string, studentId: string): Promise<void> {
    await this._tokens.invalidateUnusedForUser('sharedParent', userId, studentId);
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
    // /magic routes mobile devices to the native app (or the install page);
    // web browsers are redirected to /login?magic= from that page.
    const loginUrl = `${this._baseUrl}/magic?token=${encodeURIComponent(raw)}`;
    const qrDataUrl = await this._qr(loginUrl);
    return { loginUrl, expiresAt, qrDataUrl };
  }
}
