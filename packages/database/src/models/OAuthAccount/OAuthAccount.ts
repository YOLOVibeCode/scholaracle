import type { ObjectId } from 'mongodb';

export type OAuthProvider = 'google' | 'apple' | 'microsoft';

export interface IOAuthAccountData {
  readonly userId: string;
  readonly provider: OAuthProvider;
  readonly providerAccountId: string;
  readonly email: string;
  readonly createdAt?: Date;
}

/**
 * OAuth account link (user <-> provider).
 */
export interface IOAuthAccount {
  readonly _id?: ObjectId;
  readonly userId: string;
  readonly provider: OAuthProvider;
  readonly providerAccountId: string;
  readonly email: string;
  readonly createdAt: Date;
}
