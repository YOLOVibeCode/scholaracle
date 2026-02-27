import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { OAuthProvider } from '../../models/OAuthAccount';

export interface IOAuthAccountRepository {
  findByProviderAndId(
    provider: OAuthProvider,
    providerAccountId: string
  ): Promise<{
    userId: string;
    email: string;
    createdAt: Date;
  } | null>;
  findByUserId(
    userId: string
  ): Promise<{ provider: OAuthProvider; email: string; createdAt: Date }[]>;
  create(
    userId: string,
    provider: OAuthProvider,
    providerAccountId: string,
    email: string
  ): Promise<void>;
  deleteByProviderAndUserId(provider: OAuthProvider, userId: string): Promise<boolean>;
}

interface OAuthDocument {
  userId: ObjectId;
  provider: OAuthProvider;
  providerAccountId: string;
  email: string;
  createdAt: Date;
}

export class OAuthAccountRepository implements IOAuthAccountRepository {
  private readonly _collection: Collection<OAuthDocument>;

  constructor(database: Db) {
    this._collection = database.collection<OAuthDocument>('oauth_accounts');
  }

  public async findByProviderAndId(
    provider: OAuthProvider,
    providerAccountId: string
  ): Promise<{ userId: string; email: string; createdAt: Date } | null> {
    const doc = await this._collection.findOne({
      provider,
      providerAccountId,
    });
    if (!doc) return null;
    return {
      userId: doc.userId.toString(),
      email: doc.email,
      createdAt: doc.createdAt,
    };
  }

  public async findByUserId(
    userId: string
  ): Promise<{ provider: OAuthProvider; email: string; createdAt: Date }[]> {
    const cursor = this._collection.find({ userId: new ObjectId(userId) });
    const docs = await cursor.toArray();
    return docs.map((d) => ({
      provider: d.provider,
      email: d.email,
      createdAt: d.createdAt,
    }));
  }

  public async create(
    userId: string,
    provider: OAuthProvider,
    providerAccountId: string,
    email: string
  ): Promise<void> {
    const now = new Date();
    await this._collection.insertOne({
      userId: new ObjectId(userId),
      provider,
      providerAccountId,
      email,
      createdAt: now,
    });
  }

  public async deleteByProviderAndUserId(
    provider: OAuthProvider,
    userId: string
  ): Promise<boolean> {
    const result = await this._collection.deleteOne({
      provider,
      userId: new ObjectId(userId),
    });
    return result.deletedCount > 0;
  }
}
