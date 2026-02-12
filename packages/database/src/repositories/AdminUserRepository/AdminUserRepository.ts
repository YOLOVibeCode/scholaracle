import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';
import { AdminUser, type IAdminUserData } from '../../models/AdminUser';
import bcrypt from 'bcryptjs';

export interface IAdminUserReader {
  findByEmail(email: string): Promise<AdminUser | null>;
  findById(id: string): Promise<AdminUser | null>;
  findAll(): Promise<readonly AdminUser[]>;
}

export interface IAdminUserWriter {
  create(adminData: IAdminUserData): Promise<AdminUser>;
  update(id: string, updates: Partial<IAdminUserData>): Promise<AdminUser | null>;
  updateLastLogin(id: string, loginTime: Date): Promise<AdminUser | null>;
  deactivate(id: string): Promise<boolean>;
}

export interface IAdminUserRepository extends IAdminUserReader, IAdminUserWriter {}

/**
 * Repository for AdminUser model operations.
 */
export class AdminUserRepository implements IAdminUserReader, IAdminUserWriter {
  private readonly _collection: Collection<IAdminUserData & { _id?: ObjectId }>;

  constructor(database: Db) {
    this._collection = database.collection<IAdminUserData & { _id?: ObjectId }>('admin_users');
  }

  /**
   * Create a new admin user.
   *
   * @param adminData - Admin user data
   * @returns Created admin user
   */
  public async create(adminData: IAdminUserData): Promise<AdminUser> {
    const now = new Date();
    const document = {
      ...adminData,
      isActive: adminData.isActive ?? true,
      mfaEnabled: adminData.mfaEnabled ?? false,
      createdAt: now,
      updatedAt: now,
    };

    const result = await this._collection.insertOne(document);
    return new AdminUser(document, result.insertedId);
  }

  /**
   * Find admin user by email.
   *
   * @param email - Admin email
   * @returns Admin user or null if not found
   */
  public async findByEmail(email: string): Promise<AdminUser | null> {
    const document = await this._collection.findOne({ email });

    if (!document || !document._id) {
      return null;
    }

    return new AdminUser(document, document._id);
  }

  /**
   * Find admin user by ID.
   *
   * @param id - Admin user ID
   * @returns Admin user or null if not found
   */
  public async findById(id: string): Promise<AdminUser | null> {
    const objectId = new ObjectId(id);
    const document = await this._collection.findOne({ _id: objectId });

    if (!document || !document._id) {
      return null;
    }

    return new AdminUser(document, document._id);
  }

  /**
   * Update admin user.
   *
   * @param id - Admin user ID
   * @param updates - Update data
   * @returns Updated admin user or null if not found
   */
  public async update(id: string, updates: Partial<IAdminUserData>): Promise<AdminUser | null> {
    const objectId = new ObjectId(id);
    const updateDoc = {
      ...updates,
      updatedAt: new Date(),
    };

    const result = await this._collection.findOneAndUpdate(
      { _id: objectId },
      { $set: updateDoc },
      { returnDocument: 'after' }
    );

    if (!result || !result._id) {
      return null;
    }

    return new AdminUser(result, result._id);
  }

  /**
   * Update admin user's last login time.
   *
   * @param id - Admin user ID
   * @param loginTime - Login timestamp
   * @returns Updated admin user or null if not found
   */
  public async updateLastLogin(id: string, loginTime: Date): Promise<AdminUser | null> {
    return this.update(id, { lastLogin: loginTime });
  }

  /**
   * Deactivate admin user.
   *
   * @param id - Admin user ID
   * @returns True if deactivated, false if not found
   */
  public async deactivate(id: string): Promise<boolean> {
    const objectId = new ObjectId(id);
    const result = await this._collection.updateOne(
      { _id: objectId },
      { $set: { isActive: false, updatedAt: new Date() } }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Find all admin users.
   *
   * @returns Array of admin users
   */
  public async findAll(): Promise<readonly AdminUser[]> {
    const documents = await this._collection.find({}).toArray();
    return documents.map((doc) => new AdminUser(doc, doc._id));
  }

  /**
   * Hash password using bcrypt.
   *
   * @param password - Plain text password
   * @returns Hashed password
   */
  public static async hashPassword(password: string): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      bcrypt.hash(password, 10, (err, hash) => {
        if (err || !hash) {
          reject(err ?? new Error('Failed to hash password'));
          return;
        }
        resolve(hash);
      });
    });
  }

  /**
   * Verify password against hash.
   *
   * @param password - Plain text password
   * @param hash - Hashed password
   * @returns True if password matches
   */
  public static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await new Promise<boolean>((resolve, reject) => {
      bcrypt.compare(password, hash, (err, same) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(Boolean(same));
      });
    });
  }
}
