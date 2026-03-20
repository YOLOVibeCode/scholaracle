import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';
import {
  CommunicationLog,
  type ICommunicationLogData,
  type CommunicationChannel,
  type CommunicationStatus,
  type CommunicationType,
} from '../../models/CommunicationLog';

export interface IPaginatedLogs {
  readonly logs: readonly CommunicationLog[];
  readonly total: number;
}

export interface ICommunicationLogReader {
  findById(id: string): Promise<CommunicationLog | null>;
  findByIdAndUserId(id: string, userId: string): Promise<CommunicationLog | null>;
  findByUserId(userId: string): Promise<readonly CommunicationLog[]>;
  findByUserIdPaginated(
    userId: string,
    options: {
      status?: CommunicationStatus;
      channel?: CommunicationChannel;
      page: number;
      limit: number;
    }
  ): Promise<IPaginatedLogs>;
  findByStudentPaginated(
    studentId: string,
    options: {
      status?: CommunicationStatus;
      channel?: CommunicationChannel;
      page: number;
      limit: number;
    }
  ): Promise<IPaginatedLogs>;
  filterByChannel(channel: CommunicationChannel): Promise<readonly CommunicationLog[]>;
  filterByType(type: CommunicationType): Promise<readonly CommunicationLog[]>;
}

export interface ICommunicationLogWriter {
  create(logData: ICommunicationLogData): Promise<CommunicationLog>;
  updateDeliveryStatus(id: string, status: CommunicationStatus): Promise<boolean>;
  updateDeliveryStatusByProviderId(
    providerId: string,
    status: CommunicationStatus
  ): Promise<boolean>;
  deleteByUserId(userId: string): Promise<number>;
}

export interface ICommunicationLogRepository
  extends ICommunicationLogReader, ICommunicationLogWriter {}

/**
 * Repository for CommunicationLog model operations.
 */
export class CommunicationLogRepository
  implements ICommunicationLogReader, ICommunicationLogWriter
{
  private readonly _collection: Collection<ICommunicationLogData & { _id?: ObjectId }>;

  constructor(database: Db) {
    this._collection = database.collection<ICommunicationLogData & { _id?: ObjectId }>(
      'communication_logs'
    );
  }

  /**
   * Create a new communication log entry.
   *
   * @param logData - Communication log data
   * @returns Created log
   */
  public async create(logData: ICommunicationLogData): Promise<CommunicationLog> {
    const document = {
      ...logData,
      createdAt: logData.createdAt ?? new Date(),
    };

    const result = await this._collection.insertOne(document);
    return new CommunicationLog(document, result.insertedId);
  }

  /**
   * Find communication log by ID.
   *
   * @param id - Log ID
   * @returns Log or null if not found
   */
  public async findById(id: string): Promise<CommunicationLog | null> {
    const objectId = new ObjectId(id);
    const document = await this._collection.findOne({ _id: objectId });

    if (!document || !document._id) {
      return null;
    }

    return new CommunicationLog(document, document._id);
  }

  /**
   * Find all communication logs for a user.
   *
   * @param userId - User ID
   * @returns Array of logs
   */
  public async findByIdAndUserId(id: string, userId: string): Promise<CommunicationLog | null> {
    const objectId = new ObjectId(id);
    const document = await this._collection.findOne({ _id: objectId, userId });
    if (!document || !document._id) return null;
    return new CommunicationLog(document, document._id);
  }

  public async findByUserIdPaginated(
    userId: string,
    options: {
      status?: CommunicationStatus;
      channel?: CommunicationChannel;
      page: number;
      limit: number;
    }
  ): Promise<IPaginatedLogs> {
    const filter: Record<string, unknown> = { userId };
    if (options.status) filter['status'] = options.status;
    if (options.channel) filter['channel'] = options.channel;

    const [documents, total] = await Promise.all([
      this._collection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((options.page - 1) * options.limit)
        .limit(options.limit)
        .toArray(),
      this._collection.countDocuments(filter),
    ]);

    return {
      logs: documents.map((doc) => new CommunicationLog(doc, doc._id)),
      total,
    };
  }

  public async findByStudentPaginated(
    studentId: string,
    options: {
      status?: CommunicationStatus;
      channel?: CommunicationChannel;
      page: number;
      limit: number;
    }
  ): Promise<IPaginatedLogs> {
    const filter: Record<string, unknown> = {
      relatedEntityType: 'student',
      relatedEntityId: studentId,
    };
    if (options.status) filter['status'] = options.status;
    if (options.channel) filter['channel'] = options.channel;

    const [documents, total] = await Promise.all([
      this._collection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((options.page - 1) * options.limit)
        .limit(options.limit)
        .toArray(),
      this._collection.countDocuments(filter),
    ]);

    return {
      logs: documents.map((doc) => new CommunicationLog(doc, doc._id)),
      total,
    };
  }

  public async findByUserId(userId: string): Promise<readonly CommunicationLog[]> {
    const documents = await this._collection.find({ userId }).sort({ createdAt: -1 }).toArray();

    return documents.map((doc) => new CommunicationLog(doc, doc._id));
  }

  /**
   * Update delivery status of a communication.
   *
   * @param id - Log ID
   * @param status - New status
   * @returns True if updated, false if not found
   */
  public async updateDeliveryStatus(id: string, status: CommunicationStatus): Promise<boolean> {
    const objectId = new ObjectId(id);
    const updateDoc: Record<string, unknown> = {
      status,
    };

    if (status === 'delivered') {
      updateDoc['deliveredAt'] = new Date();
    } else if (status === 'opened') {
      updateDoc['openedAt'] = new Date();
    } else if (status === 'clicked') {
      updateDoc['clickedAt'] = new Date();
    } else if (status === 'failed') {
      updateDoc['failedAt'] = new Date();
    }

    const result = await this._collection.updateOne({ _id: objectId }, { $set: updateDoc });

    return result.modifiedCount > 0;
  }

  /**
   * Update delivery status by external provider ID (e.g. Twilio MessageSid).
   *
   * @param providerId - External provider message ID
   * @param status - New status
   * @returns True if updated, false if not found
   */
  public async updateDeliveryStatusByProviderId(
    providerId: string,
    status: CommunicationStatus
  ): Promise<boolean> {
    const updateDoc: Record<string, unknown> = { status };

    if (status === 'delivered') {
      updateDoc['deliveredAt'] = new Date();
    } else if (status === 'failed') {
      updateDoc['failedAt'] = new Date();
    }

    const result = await this._collection.updateOne({ providerId }, { $set: updateDoc });

    return result.modifiedCount > 0;
  }

  /**
   * Delete all communication logs for a user.
   *
   * @param userId - User ID
   * @returns Number of deleted logs
   */
  public async deleteByUserId(userId: string): Promise<number> {
    const result = await this._collection.deleteMany({ userId });
    return result.deletedCount;
  }

  /**
   * Filter logs by communication channel.
   *
   * @param channel - Channel type
   * @returns Array of logs
   */
  public async filterByChannel(
    channel: CommunicationChannel
  ): Promise<readonly CommunicationLog[]> {
    const documents = await this._collection.find({ channel }).sort({ createdAt: -1 }).toArray();

    return documents.map((doc) => new CommunicationLog(doc, doc._id));
  }

  /**
   * Filter logs by communication type.
   *
   * @param type - Communication type
   * @returns Array of logs
   */
  public async filterByType(type: CommunicationType): Promise<readonly CommunicationLog[]> {
    const documents = await this._collection.find({ type }).sort({ createdAt: -1 }).toArray();

    return documents.map((doc) => new CommunicationLog(doc, doc._id));
  }
}
