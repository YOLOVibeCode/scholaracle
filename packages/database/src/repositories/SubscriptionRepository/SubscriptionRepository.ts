import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';
import { Subscription, type ISubscriptionData, type SubscriptionPlan } from '../../models/Subscription';

export interface ISubscriptionRepository {
  create(subscriptionData: ISubscriptionData): Promise<Subscription>;
  findByUserId(userId: string): Promise<Subscription | null>;
  findById(id: string): Promise<Subscription | null>;
  findAll(filters?: Record<string, unknown>): Promise<readonly Subscription[]>;
  update(userId: string, updates: Partial<ISubscriptionData>): Promise<Subscription | null>;
  changePlan(userId: string, newPlan: SubscriptionPlan, performedBy?: string): Promise<Subscription | null>;
  cancel(userId: string, reason?: string): Promise<boolean>;
  reactivate(userId: string): Promise<boolean>;
  extendTrial(userId: string, days: number, performedBy?: string, reason?: string): Promise<Subscription | null>;
  getExpiringSubscriptions(daysUntilExpiry: number): Promise<readonly Subscription[]>;
}

/**
 * Repository for Subscription model operations.
 */
export class SubscriptionRepository implements ISubscriptionRepository {
  private readonly _collection: Collection<ISubscriptionData & { _id?: ObjectId }>;

  constructor(database: Db) {
    this._collection = database.collection<ISubscriptionData & { _id?: ObjectId }>('subscriptions');
  }

  /**
   * Create a new subscription.
   *
   * @param subscriptionData - Subscription data
   * @returns Created subscription
   */
  public async create(subscriptionData: ISubscriptionData): Promise<Subscription> {
    const now = new Date();
    const document = {
      ...subscriptionData,
      createdAt: now,
      updatedAt: now,
      events: [
        {
          type: 'created' as const,
          toPlan: subscriptionData.plan,
          timestamp: now,
        },
      ],
    };

    const result = await this._collection.insertOne(document);
    return new Subscription(document, result.insertedId);
  }

  /**
   * Find subscription by user ID.
   *
   * @param userId - User ID
   * @returns Subscription or null if not found
   */
  public async findByUserId(userId: string): Promise<Subscription | null> {
    const document = await this._collection.findOne({ userId });

    if (!document || !document._id) {
      return null;
    }

    return new Subscription(document, document._id);
  }

  /**
   * Find subscription by ID.
   *
   * @param id - Subscription ID
   * @returns Subscription or null if not found
   */
  public async findById(id: string): Promise<Subscription | null> {
    const objectId = new ObjectId(id);
    const document = await this._collection.findOne({ _id: objectId });

    if (!document || !document._id) {
      return null;
    }

    return new Subscription(document, document._id);
  }

  /**
   * Find all subscriptions with optional filters.
   *
   * @param filters - Optional filters
   * @returns Array of subscriptions
   */
  public async findAll(filters: Record<string, unknown> = {}): Promise<readonly Subscription[]> {
    const documents = await this._collection
      .find(filters)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    return documents.map((doc) => new Subscription(doc, doc._id));
  }

  /**
   * Update subscription.
   *
   * @param userId - User ID
   * @param updates - Update data
   * @returns Updated subscription or null if not found
   */
  public async update(userId: string, updates: Partial<ISubscriptionData>): Promise<Subscription | null> {
    const updateDoc = {
      ...updates,
      updatedAt: new Date(),
    };

    const result = await this._collection.findOneAndUpdate(
      { userId },
      { $set: updateDoc },
      { returnDocument: 'after' }
    );

    if (!result || !result._id) {
      return null;
    }

    return new Subscription(result, result._id);
  }

  /**
   * Change subscription plan.
   *
   * @param userId - User ID
   * @param newPlan - New plan
   * @param performedBy - Admin ID who performed the change
   * @returns Updated subscription or null if not found
   */
  public async changePlan(
    userId: string,
    newPlan: SubscriptionPlan,
    performedBy?: string
  ): Promise<Subscription | null> {
    const current = await this.findByUserId(userId);
    if (!current) {
      return null;
    }

    const event = {
      type: (newPlan > current.plan ? 'upgraded' : 'downgraded') as 'upgraded' | 'downgraded',
      fromPlan: current.plan,
      toPlan: newPlan,
      performedBy,
      timestamp: new Date(),
    };

    const result = await this._collection.findOneAndUpdate(
      { userId },
      {
        $set: { plan: newPlan, updatedAt: new Date() },
        $push: { events: event } as never,
      },
      { returnDocument: 'after' }
    );

    if (!result || !result._id) {
      return null;
    }

    return new Subscription(result, result._id);
  }

  /**
   * Cancel subscription.
   *
   * @param userId - User ID
   * @param reason - Cancellation reason
   * @returns True if cancelled, false if not found
   */
  public async cancel(userId: string, reason?: string): Promise<boolean> {
    const event = {
      type: 'cancelled' as const,
      reason,
      timestamp: new Date(),
    };

    const result = await this._collection.updateOne(
      { userId },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: reason,
          updatedAt: new Date(),
        },
        $push: { events: event } as never,
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Reactivate cancelled subscription.
   *
   * @param userId - User ID
   * @returns True if reactivated, false if not found
   */
  public async reactivate(userId: string): Promise<boolean> {
    const event = {
      type: 'reactivated' as const,
      timestamp: new Date(),
    };

    const result = await this._collection.updateOne(
      { userId },
      {
        $set: {
          status: 'active',
          updatedAt: new Date(),
        },
        $unset: {
          cancelledAt: '',
          cancellationReason: '',
        },
        $push: { events: event } as never,
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Extend a trial subscription by N days.
   * Records an event for history/auditing in the subscription document.
   */
  public async extendTrial(
    userId: string,
    days: number,
    performedBy?: string,
    reason?: string
  ): Promise<Subscription | null> {
    const current = await this.findByUserId(userId);
    if (!current) return null;

    // Only meaningful for trialing subscriptions; treat others as not eligible.
    if (current.status !== 'trialing') return null;
    if (!Number.isFinite(days) || days <= 0) return null;

    const newEnd = new Date(current.currentPeriodEnd);
    newEnd.setDate(newEnd.getDate() + days);

    const event = {
      type: 'trial_extended' as const,
      days,
      reason,
      performedBy,
      timestamp: new Date(),
    };

    const result = await this._collection.findOneAndUpdate(
      { userId },
      {
        $set: { currentPeriodEnd: newEnd, updatedAt: new Date() },
        $push: { events: event } as never,
      },
      { returnDocument: 'after' }
    );

    if (!result || !result._id) return null;
    return new Subscription(result, result._id);
  }

  /**
   * Get subscriptions expiring within specified days.
   *
   * @param daysUntilExpiry - Number of days
   * @returns Array of expiring subscriptions
   */
  public async getExpiringSubscriptions(daysUntilExpiry: number): Promise<readonly Subscription[]> {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + daysUntilExpiry);

    const documents = await this._collection
      .find({
        status: 'active',
        currentPeriodEnd: { $lte: expiryDate },
      })
      .toArray();

    return documents.map((doc) => new Subscription(doc, doc._id));
  }
}

