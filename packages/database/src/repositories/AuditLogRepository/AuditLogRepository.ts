import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';
import { AuditLog, type IAuditLogData, type AuditAction } from '../../models/AuditLog';

export interface IPaginationOptions {
  readonly page: number;
  readonly limit: number;
}

export interface IPaginatedResult<T> {
  readonly data: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface IAuditLogRepository {
  create(logData: IAuditLogData): Promise<AuditLog>;
  findByAdminUserId(adminUserId: string): Promise<readonly AuditLog[]>;
  findByEntity(entityType: string, entityId: string): Promise<readonly AuditLog[]>;
  findByAction(action: AuditAction): Promise<readonly AuditLog[]>;
  findByDateRange(startDate: Date, endDate: Date): Promise<readonly AuditLog[]>;
  findWithPagination(options: IPaginationOptions): Promise<IPaginatedResult<AuditLog>>;
}

/**
 * Repository for AuditLog model operations.
 */
export class AuditLogRepository implements IAuditLogRepository {
  private readonly _collection: Collection<IAuditLogData & { _id?: ObjectId }>;

  constructor(database: Db) {
    this._collection = database.collection<IAuditLogData & { _id?: ObjectId }>('audit_logs');
  }

  /**
   * Create a new audit log entry.
   *
   * @param logData - Audit log data
   * @returns Created audit log
   */
  public async create(logData: IAuditLogData): Promise<AuditLog> {
    const document = {
      ...logData,
      timestamp: logData.timestamp ?? new Date(),
    };

    const result = await this._collection.insertOne(document);
    return new AuditLog(document, result.insertedId);
  }

  /**
   * Find audit logs by admin user ID.
   *
   * @param adminUserId - Admin user ID
   * @returns Array of audit logs
   */
  public async findByAdminUserId(adminUserId: string): Promise<readonly AuditLog[]> {
    const documents = await this._collection
      .find({ adminUserId })
      .sort({ timestamp: -1 })
      .toArray();

    return documents.map((doc) => new AuditLog(doc, doc._id));
  }

  /**
   * Find audit logs by entity type and ID.
   *
   * @param entityType - Entity type (e.g., 'customer', 'payment')
   * @param entityId - Entity ID
   * @returns Array of audit logs
   */
  public async findByEntity(entityType: string, entityId: string): Promise<readonly AuditLog[]> {
    const documents = await this._collection
      .find({ entityType, entityId })
      .sort({ timestamp: -1 })
      .toArray();

    return documents.map((doc) => new AuditLog(doc, doc._id));
  }

  /**
   * Find audit logs by action type.
   *
   * @param action - Action type (e.g., 'customer:view')
   * @returns Array of audit logs
   */
  public async findByAction(action: AuditAction): Promise<readonly AuditLog[]> {
    const documents = await this._collection
      .find({ action })
      .sort({ timestamp: -1 })
      .toArray();

    return documents.map((doc) => new AuditLog(doc, doc._id));
  }

  /**
   * Find audit logs within a date range.
   *
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Array of audit logs
   */
  public async findByDateRange(startDate: Date, endDate: Date): Promise<readonly AuditLog[]> {
    const documents = await this._collection
      .find({
        timestamp: {
          $gte: startDate,
          $lte: endDate,
        },
      })
      .sort({ timestamp: -1 })
      .toArray();

    return documents.map((doc) => new AuditLog(doc, doc._id));
  }

  /**
   * Find audit logs with pagination.
   *
   * @param options - Pagination options
   * @returns Paginated result
   */
  public async findWithPagination(
    options: IPaginationOptions
  ): Promise<IPaginatedResult<AuditLog>> {
    const { page, limit } = options;
    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      this._collection
        .find({})
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      this._collection.countDocuments({}),
    ]);

    const data = documents.map((doc) => new AuditLog(doc, doc._id));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

