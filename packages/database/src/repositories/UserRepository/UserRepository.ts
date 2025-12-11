import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';
import { User, type IUserData } from '../../models/User';
import bcrypt from 'bcrypt';

export interface IPaginationOptions {
  readonly page: number;
  readonly limit: number;
  readonly filters?: Record<string, unknown>;
  readonly sort?: Record<string, 1 | -1>;
}

export interface IPaginatedResult<T> {
  readonly data: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface IUserStatistics {
  readonly totalUsers: number;
  readonly byPlan: Record<string, number>;
  readonly byStatus: Record<string, number>;
  readonly activeUsers: number;
  readonly suspendedUsers: number;
}

export interface IUserRepository {
  create(userData: IUserData): Promise<User>;
  findById(id: string | ObjectId): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  update(id: string | ObjectId, updates: Partial<IUserData>): Promise<User | null>;
  delete(id: string | ObjectId): Promise<boolean>;
  findWithPagination(options: IPaginationOptions): Promise<IPaginatedResult<User>>;
  searchUsers(query: string): Promise<readonly User[]>;
  suspendUser(userId: string, reason: string): Promise<boolean>;
  unsuspendUser(userId: string): Promise<boolean>;
  getUserStatistics(): Promise<IUserStatistics>;
}

/**
 * Repository for User model operations.
 */
export class UserRepository implements IUserRepository {
  private readonly _collection: Collection<IUserData & { _id?: ObjectId }>;

  constructor(database: Db) {
    this._collection = database.collection<IUserData & { _id?: ObjectId }>('users');
  }

  /**
   * Create a new user.
   *
   * @param userData - User data
   * @returns Created user
   */
  public async create(userData: IUserData): Promise<User> {
    const now = new Date();
    const document = {
      ...userData,
      createdAt: now,
      updatedAt: now,
    };

    const result = await this._collection.insertOne(document);

    return new User(document, result.insertedId);
  }

  /**
   * Find user by ID.
   *
   * @param id - User ID
   * @returns User or null if not found
   */
  public async findById(id: string | ObjectId): Promise<User | null> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    const document = await this._collection.findOne({ _id: objectId });

    if (!document || !document._id) {
      return null;
    }

    return new User(document, document._id);
  }

  /**
   * Find user by email.
   *
   * @param email - User email
   * @returns User or null if not found
   */
  public async findByEmail(email: string): Promise<User | null> {
    const document = await this._collection.findOne({ email });

    if (!document || !document._id) {
      return null;
    }

    return new User(document, document._id);
  }

  /**
   * Update user.
   *
   * @param id - User ID
   * @param updates - Update data
   * @returns Updated user or null if not found
   */
  public async update(id: string | ObjectId, updates: Partial<IUserData>): Promise<User | null> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
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

    return new User(result, result._id);
  }

  /**
   * Delete user.
   *
   * @param id - User ID
   * @returns True if deleted, false if not found
   */
  public async delete(id: string | ObjectId): Promise<boolean> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    const result = await this._collection.deleteOne({ _id: objectId });

    return result.deletedCount > 0;
  }

  /**
   * Hash password using bcrypt.
   *
   * @param password - Plain text password
   * @returns Hashed password
   */
  public static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /**
   * Verify password against hash.
   *
   * @param password - Plain text password
   * @param hash - Hashed password
   * @returns True if password matches
   */
  public static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Find users with pagination and filters.
   *
   * @param options - Pagination and filter options
   * @returns Paginated result
   */
  public async findWithPagination(options: IPaginationOptions): Promise<IPaginatedResult<User>> {
    const { page, limit, filters = {}, sort = { createdAt: -1 } } = options;
    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      this._collection.find(filters).sort(sort).skip(skip).limit(limit).toArray(),
      this._collection.countDocuments(filters),
    ]);

    const data = documents.map((doc) => new User(doc, doc._id));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Search users by email or name.
   *
   * @param query - Search query
   * @returns Array of matching users
   */
  public async searchUsers(query: string): Promise<readonly User[]> {
    const searchRegex = { $regex: query, $options: 'i' };
    const documents = await this._collection
      .find({
        $or: [{ email: searchRegex }, { name: searchRegex }],
      })
      .limit(50)
      .toArray();

    return documents.map((doc) => new User(doc, doc._id));
  }

  /**
   * Suspend user account.
   *
   * @param userId - User ID
   * @param reason - Suspension reason
   * @returns True if suspended
   */
  public async suspendUser(userId: string, reason: string): Promise<boolean> {
    const objectId = new ObjectId(userId);
    const result = await this._collection.updateOne(
      { _id: objectId },
      {
        $set: {
          isSuspended: true,
          suspendedReason: reason,
          suspendedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Unsuspend user account.
   *
   * @param userId - User ID
   * @returns True if unsuspended
   */
  public async unsuspendUser(userId: string): Promise<boolean> {
    const objectId = new ObjectId(userId);
    const result = await this._collection.updateOne(
      { _id: objectId },
      {
        $set: {
          isSuspended: false,
          updatedAt: new Date(),
        },
        $unset: {
          suspendedAt: '',
          suspendedReason: '',
          suspendedBy: '',
        },
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Get user statistics for admin dashboard.
   *
   * @returns User statistics
   */
  public async getUserStatistics(): Promise<IUserStatistics> {
    const totalUsers = await this._collection.countDocuments({});

    const pipeline = [
      {
        $group: {
          _id: '$subscription.plan',
          count: { $sum: 1 },
        },
      },
    ];

    const byPlanArray = await this._collection.aggregate(pipeline).toArray();
    const byPlan: Record<string, number> = {};
    for (const item of byPlanArray) {
      const plan = (item['_id'] as string | null | undefined) ?? 'free';
      const count = (item['count'] as number) ?? 0;
      byPlan[plan] = count;
    }

    const activeUsers = await this._collection.countDocuments({ isSuspended: { $ne: true } });
    const suspendedUsers = await this._collection.countDocuments({ isSuspended: true });

    return {
      totalUsers,
      byPlan,
      byStatus: {
        active: activeUsers,
        suspended: suspendedUsers,
      },
      activeUsers,
      suspendedUsers,
    };
  }
}
