import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';

export type MagicLoginKind = 'student' | 'sharedParent';

/**
 * Discriminated payload stored in the token document.
 * - student: bound to a userId
 * - sharedParent (accepted): bound to a userId
 * - sharedParent (pending invite): bound to studentId + inviteEmail; no userId yet
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
  consumeValid(
    tokenHash: string,
    now?: Date
  ): Promise<
    | { readonly userId: string }
    | { readonly pendingInvite: { readonly studentId: string; readonly email: string } }
    | null
  >;
  invalidateUnusedForUser(kind: MagicLoginKind, userId: string): Promise<void>;
  invalidateUnusedForPendingInvite(studentId: string, inviteEmail: string): Promise<void>;
}

interface TokenDocument {
  kind: MagicLoginKind;
  /** Present for accepted contacts and students. */
  userId?: ObjectId;
  /** Present for pending-invite sharedParent tokens. */
  studentId?: ObjectId;
  inviteEmail?: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  usedAt?: Date;
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
      inviteEmail: inviteEmail.toLowerCase().trim(),
      tokenHash,
      expiresAt,
      createdAt: new Date(),
    });
  }

  public async consumeValid(
    tokenHash: string,
    now?: Date
  ): Promise<
    | { readonly userId: string }
    | { readonly pendingInvite: { readonly studentId: string; readonly email: string } }
    | null
  > {
    const at = now ?? new Date();
    const result = await this._collection.findOneAndUpdate(
      { tokenHash, expiresAt: { $gt: at }, usedAt: { $exists: false } },
      { $set: { usedAt: at } },
      { returnDocument: 'before' }
    );
    if (!result) {
      return null;
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
      inviteEmail: inviteEmail.toLowerCase().trim(),
      usedAt: { $exists: false },
    });
  }
}
