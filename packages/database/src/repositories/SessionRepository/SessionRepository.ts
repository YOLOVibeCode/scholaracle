import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';

export type UserType = 'user' | 'admin';

export interface ISessionDeviceInfo {
  readonly userAgent?: string;
  readonly browser?: string;
  readonly os?: string;
  readonly device?: string;
}

export interface ISessionData {
  readonly userId: string;
  readonly userType: UserType;
  readonly refreshTokenFamilyId: string;
  readonly deviceInfo: ISessionDeviceInfo;
  readonly ipAddress: string;
  readonly location?: string;
  readonly lastActiveAt: Date;
  readonly createdAt: Date;
  readonly revokedAt?: Date;
}

export interface ISessionRecord extends ISessionData {
  readonly _id: ObjectId;
}

export interface ISessionRepository {
  create(data: Omit<ISessionData, 'createdAt'>): Promise<ISessionRecord>;
  findActiveByUserId(userId: string, userType: UserType): Promise<ISessionRecord[]>;
  findActiveByAdminId(adminId: string): Promise<ISessionRecord[]>;
  findByFamilyId(
    userId: string,
    userType: UserType,
    familyId: string
  ): Promise<ISessionRecord | null>;
  revokeById(sessionId: string): Promise<boolean>;
  revokeByFamilyId(userId: string, userType: UserType, familyId: string): Promise<boolean>;
  revokeAllExcept(userId: string, userType: UserType, exceptFamilyId: string): Promise<number>;
  updateLastActive(sessionId: string): Promise<boolean>;
  /** Super-admin: list all active sessions for a user (userType 'user'). */
  findActiveSessionsForUser(userId: string): Promise<ISessionRecord[]>;
  /** Super-admin: list all active sessions for an admin (userType 'admin'). */
  findActiveSessionsForAdmin(adminId: string): Promise<ISessionRecord[]>;
}

interface SessionDocument {
  userId: ObjectId;
  userType: UserType;
  refreshTokenFamilyId: string;
  deviceInfo: ISessionDeviceInfo;
  ipAddress: string;
  location?: string;
  lastActiveAt: Date;
  createdAt: Date;
  revokedAt?: Date;
}

function toRecord(doc: SessionDocument & { _id: ObjectId }): ISessionRecord {
  return {
    _id: doc._id,
    userId: doc.userId.toString(),
    userType: doc.userType,
    refreshTokenFamilyId: doc.refreshTokenFamilyId,
    deviceInfo: doc.deviceInfo,
    ipAddress: doc.ipAddress,
    location: doc.location,
    lastActiveAt: doc.lastActiveAt,
    createdAt: doc.createdAt,
    revokedAt: doc.revokedAt,
  };
}

export class SessionRepository implements ISessionRepository {
  private readonly _collection: Collection<SessionDocument>;

  constructor(database: Db) {
    this._collection = database.collection<SessionDocument>('sessions');
  }

  public async create(data: Omit<ISessionData, 'createdAt'>): Promise<ISessionRecord> {
    const now = new Date();
    const doc: SessionDocument = {
      userId: new ObjectId(data.userId),
      userType: data.userType,
      refreshTokenFamilyId: data.refreshTokenFamilyId,
      deviceInfo: data.deviceInfo,
      ipAddress: data.ipAddress,
      location: data.location,
      lastActiveAt: data.lastActiveAt,
      createdAt: now,
    };
    const result = await this._collection.insertOne(doc as SessionDocument & { _id?: ObjectId });
    const id = result.insertedId;
    return toRecord({
      _id: id,
      ...doc,
    } as SessionDocument & { _id: ObjectId });
  }

  public async findActiveByUserId(userId: string, userType: UserType): Promise<ISessionRecord[]> {
    const cursor = this._collection.find({
      userId: new ObjectId(userId),
      userType,
      revokedAt: { $exists: false },
    });
    const docs = await cursor.toArray();
    return docs.map((d) => toRecord(d as SessionDocument & { _id: ObjectId }));
  }

  public async findActiveByAdminId(adminId: string): Promise<ISessionRecord[]> {
    return this.findActiveByUserId(adminId, 'admin');
  }

  public async findByFamilyId(
    userId: string,
    userType: UserType,
    familyId: string
  ): Promise<ISessionRecord | null> {
    const doc = await this._collection.findOne({
      userId: new ObjectId(userId),
      userType,
      refreshTokenFamilyId: familyId,
      revokedAt: { $exists: false },
    });
    if (!doc) return null;
    return toRecord(doc as SessionDocument & { _id: ObjectId });
  }

  public async revokeById(sessionId: string): Promise<boolean> {
    let id: ObjectId;
    try {
      id = new ObjectId(sessionId);
    } catch {
      return false;
    }
    const result = await this._collection.updateOne(
      { _id: id },
      { $set: { revokedAt: new Date() } }
    );
    return result.matchedCount > 0;
  }

  public async revokeByFamilyId(
    userId: string,
    userType: UserType,
    familyId: string
  ): Promise<boolean> {
    const result = await this._collection.updateMany(
      {
        userId: new ObjectId(userId),
        userType,
        refreshTokenFamilyId: familyId,
      },
      { $set: { revokedAt: new Date() } }
    );
    return result.matchedCount > 0;
  }

  public async revokeAllExcept(
    userId: string,
    userType: UserType,
    exceptFamilyId: string
  ): Promise<number> {
    const result = await this._collection.updateMany(
      {
        userId: new ObjectId(userId),
        userType,
        refreshTokenFamilyId: { $ne: exceptFamilyId },
        revokedAt: { $exists: false },
      },
      { $set: { revokedAt: new Date() } }
    );
    return result.modifiedCount;
  }

  public async updateLastActive(sessionId: string): Promise<boolean> {
    let id: ObjectId;
    try {
      id = new ObjectId(sessionId);
    } catch {
      return false;
    }
    const now = new Date();
    const result = await this._collection.updateOne(
      { _id: id, revokedAt: { $exists: false } },
      { $set: { lastActiveAt: now } }
    );
    return result.matchedCount > 0;
  }

  public async findActiveSessionsForUser(userId: string): Promise<ISessionRecord[]> {
    return this.findActiveByUserId(userId, 'user');
  }

  public async findActiveSessionsForAdmin(adminId: string): Promise<ISessionRecord[]> {
    return this.findActiveByUserId(adminId, 'admin');
  }
}
