import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';

export type MagicLoginKind = 'student' | 'sharedParent' | 'inviteGroup';

/** Payload of a consumed invite-group token: the invited address and the students it covers. */
export interface IInviteGroupTokenPayload {
  readonly email: string;
  readonly studentIds: readonly string[];
  readonly inviteGroupId?: string;
}

export type MagicLoginConsumeResult =
  | { readonly userId: string }
  | { readonly pendingInvite: { readonly studentId: string; readonly email: string } }
  | { readonly inviteGroup: IInviteGroupTokenPayload }
  | null;

/**
 * Discriminated payload stored in the token document.
 * - student: bound to a userId
 * - sharedParent (accepted): bound to a userId
 * - sharedParent (pending invite): bound to studentId + inviteEmail; no userId yet
 * - inviteGroup: bound to inviteEmail + studentIds[] (one invitation across several students)
 */
export interface IMagicLoginTokenStore {
  createForUser(
    kind: MagicLoginKind,
    userId: string,
    tokenHash: string,
    expiresAt: Date
  ): Promise<void>;
  createForPendingInvite(
    studentId: string,
    inviteEmail: string,
    tokenHash: string,
    expiresAt: Date
  ): Promise<void>;
  createForInviteGroup(
    inviteEmail: string,
    studentIds: readonly string[],
    tokenHash: string,
    expiresAt: Date,
    inviteGroupId?: string
  ): Promise<void>;
  consumeValid(tokenHash: string, now?: Date): Promise<MagicLoginConsumeResult>;
  invalidateUnusedForUser(kind: MagicLoginKind, userId: string): Promise<void>;
  invalidateUnusedForPendingInvite(studentId: string, inviteEmail: string): Promise<void>;
  /**
   * Drop `studentId` from every unused invite-group token addressed to `inviteEmail`, deleting
   * tokens left with no students. Also removes legacy pending-invite tokens for that pair.
   * Called when an invitation is removed, declined, accepted, or the person leaves.
   */
  invalidateUnusedForInviteEmailAndStudent(inviteEmail: string, studentId: string): Promise<void>;
  /** Delete every unused token of an invite group (before a resend mints a new one). */
  invalidateUnusedForInviteGroup(inviteGroupId: string): Promise<void>;
}

interface TokenDocument {
  kind: MagicLoginKind;
  /** Present for accepted contacts and students. */
  userId?: ObjectId;
  /** Present for pending-invite sharedParent tokens. */
  studentId?: ObjectId;
  /** Present for inviteGroup tokens. */
  studentIds?: ObjectId[];
  inviteGroupId?: string;
  inviteEmail?: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  usedAt?: Date;
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * One-time magic-login tokens for all household roles.
 * Callers must store SHA-256 hashes, never raw tokens.
 */
export class MagicLoginTokenRepository implements IMagicLoginTokenStore {
  private readonly _collection: Collection<TokenDocument>;

  constructor(database: Db) {
    this._collection = database.collection<TokenDocument>('magic_login_tokens');
  }

  public async createForUser(
    kind: MagicLoginKind,
    userId: string,
    tokenHash: string,
    expiresAt: Date
  ): Promise<void> {
    await this._collection.insertOne({
      kind,
      userId: new ObjectId(userId),
      tokenHash,
      expiresAt,
      createdAt: new Date(),
    });
  }

  public async createForPendingInvite(
    studentId: string,
    inviteEmail: string,
    tokenHash: string,
    expiresAt: Date
  ): Promise<void> {
    await this._collection.insertOne({
      kind: 'sharedParent',
      studentId: new ObjectId(studentId),
      inviteEmail: normalizeEmail(inviteEmail),
      tokenHash,
      expiresAt,
      createdAt: new Date(),
    });
  }

  public async createForInviteGroup(
    inviteEmail: string,
    studentIds: readonly string[],
    tokenHash: string,
    expiresAt: Date,
    inviteGroupId?: string
  ): Promise<void> {
    if (studentIds.length === 0) {
      throw new Error('An invite-group token needs at least one student');
    }
    await this._collection.insertOne({
      kind: 'inviteGroup',
      inviteEmail: normalizeEmail(inviteEmail),
      studentIds: studentIds.map((id) => new ObjectId(id)),
      ...(inviteGroupId ? { inviteGroupId } : {}),
      tokenHash,
      expiresAt,
      createdAt: new Date(),
    });
  }

  public async consumeValid(tokenHash: string, now?: Date): Promise<MagicLoginConsumeResult> {
    const at = now ?? new Date();
    const result = await this._collection.findOneAndUpdate(
      { tokenHash, expiresAt: { $gt: at }, usedAt: { $exists: false } },
      { $set: { usedAt: at } },
      { returnDocument: 'before' }
    );
    if (!result) {
      return null;
    }
    if (result.kind === 'inviteGroup' && result.inviteEmail && result.studentIds) {
      return {
        inviteGroup: {
          email: result.inviteEmail,
          studentIds: result.studentIds.map((id) => id.toString()),
          ...(result.inviteGroupId ? { inviteGroupId: result.inviteGroupId } : {}),
        },
      };
    }
    if (result.userId) {
      return { userId: result.userId.toString() };
    }
    if (result.studentId && result.inviteEmail) {
      return {
        pendingInvite: {
          studentId: result.studentId.toString(),
          email: result.inviteEmail,
        },
      };
    }
    return null;
  }

  public async invalidateUnusedForUser(kind: MagicLoginKind, userId: string): Promise<void> {
    await this._collection.deleteMany({
      kind,
      userId: new ObjectId(userId),
      usedAt: { $exists: false },
    });
  }

  public async invalidateUnusedForPendingInvite(
    studentId: string,
    inviteEmail: string
  ): Promise<void> {
    await this._collection.deleteMany({
      kind: 'sharedParent',
      studentId: new ObjectId(studentId),
      inviteEmail: normalizeEmail(inviteEmail),
      usedAt: { $exists: false },
    });
  }

  public async invalidateUnusedForInviteEmailAndStudent(
    inviteEmail: string,
    studentId: string
  ): Promise<void> {
    const email = normalizeEmail(inviteEmail);
    const sid = new ObjectId(studentId);
    await this.invalidateUnusedForPendingInvite(studentId, email);
    await this._collection.updateMany(
      { kind: 'inviteGroup', inviteEmail: email, studentIds: sid, usedAt: { $exists: false } },
      { $pull: { studentIds: sid } }
    );
    await this._collection.deleteMany({
      kind: 'inviteGroup',
      inviteEmail: email,
      studentIds: { $size: 0 },
      usedAt: { $exists: false },
    });
  }

  public async invalidateUnusedForInviteGroup(inviteGroupId: string): Promise<void> {
    await this._collection.deleteMany({
      kind: 'inviteGroup',
      inviteGroupId,
      usedAt: { $exists: false },
    });
  }
}
