import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';
import { Payment, type IPaymentData, type PaymentStatus } from '../../models/Payment';

export interface IPaymentRepository {
  create(paymentData: IPaymentData): Promise<Payment>;
  findById(id: string): Promise<Payment | null>;
  findByUserId(userId: string): Promise<readonly Payment[]>;
  findByStripeId(stripePaymentIntentId: string): Promise<Payment | null>;
  updateStatus(id: string, status: PaymentStatus, failureReason?: string): Promise<boolean>;
  recordRefund(id: string, amount: number, refundedBy: string, reason?: string): Promise<boolean>;
  getLifetimeValueByUserId(userId: string): Promise<number>;
  getRevenueByPeriod(startDate: Date, endDate: Date): Promise<number>;
}

/**
 * Repository for Payment model operations.
 */
export class PaymentRepository implements IPaymentRepository {
  private readonly _collection: Collection<IPaymentData & { _id?: ObjectId }>;

  constructor(database: Db) {
    this._collection = database.collection<IPaymentData & { _id?: ObjectId }>('payments');
  }

  /**
   * Create a new payment.
   *
   * @param paymentData - Payment data
   * @returns Created payment
   */
  public async create(paymentData: IPaymentData): Promise<Payment> {
    const now = new Date();
    const document = {
      ...paymentData,
      amountRefunded: 0,
      createdAt: now,
      updatedAt: now,
    };

    const result = await this._collection.insertOne(document);
    return new Payment(document, result.insertedId);
  }

  /**
   * Find payment by ID.
   *
   * @param id - Payment ID
   * @returns Payment or null if not found
   */
  public async findById(id: string): Promise<Payment | null> {
    const objectId = new ObjectId(id);
    const document = await this._collection.findOne({ _id: objectId });

    if (!document || !document._id) {
      return null;
    }

    return new Payment(document, document._id);
  }

  /**
   * Find all payments for a user.
   *
   * @param userId - User ID
   * @returns Array of payments
   */
  public async findByUserId(userId: string): Promise<readonly Payment[]> {
    const documents = await this._collection
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();

    return documents.map((doc) => new Payment(doc, doc._id));
  }

  /**
   * Find payment by Stripe payment intent ID.
   *
   * @param stripePaymentIntentId - Stripe payment intent ID
   * @returns Payment or null if not found
   */
  public async findByStripeId(stripePaymentIntentId: string): Promise<Payment | null> {
    const document = await this._collection.findOne({ stripePaymentIntentId });

    if (!document || !document._id) {
      return null;
    }

    return new Payment(document, document._id);
  }

  /**
   * Update payment status.
   *
   * @param id - Payment ID
   * @param status - New status
   * @param failureReason - Optional failure reason
   * @returns True if updated, false if not found
   */
  public async updateStatus(
    id: string,
    status: PaymentStatus,
    failureReason?: string
  ): Promise<boolean> {
    const objectId = new ObjectId(id);
    const updateDoc: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };

    if (failureReason) {
      updateDoc['failureReason'] = failureReason;
    }

    const result = await this._collection.updateOne(
      { _id: objectId },
      { $set: updateDoc }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Record a refund on a payment.
   *
   * @param id - Payment ID
   * @param amount - Refund amount
   * @param refundedBy - Admin user ID
   * @param reason - Refund reason
   * @returns True if recorded, false if not found
   */
  public async recordRefund(
    id: string,
    amount: number,
    refundedBy: string,
    reason?: string
  ): Promise<boolean> {
    const objectId = new ObjectId(id);
    const payment = await this.findById(id);

    if (!payment) {
      return false;
    }

    const newStatus: PaymentStatus = payment.amount === amount ? 'refunded' : 'partially_refunded';

    const result = await this._collection.updateOne(
      { _id: objectId },
      {
        $set: {
          status: newStatus,
          amountRefunded: amount,
          refundedAt: new Date(),
          refundedBy,
          refundReason: reason,
          updatedAt: new Date(),
        },
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Get total revenue for a period.
   *
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Total revenue in cents
   */
  public async getRevenueByPeriod(startDate: Date, endDate: Date): Promise<number> {
    const pipeline = [
      {
        $match: {
          status: 'succeeded',
          createdAt: {
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ];

    const results = await this._collection.aggregate(pipeline).toArray();
    
    if (results.length === 0) {
      return 0;
    }

    return (results[0]?.['total'] as number) ?? 0;
  }

  /**
   * Compute lifetime value (LTV) for a user as net paid amount:
   * sum(amount) - sum(amountRefunded) across successful/partially refunded/refunded payments.
   *
   * @returns Net LTV in cents
   */
  public async getLifetimeValueByUserId(userId: string): Promise<number> {
    const pipeline = [
      {
        $match: {
          userId,
          status: { $in: ['succeeded', 'partially_refunded', 'refunded'] },
        },
      },
      {
        $group: {
          _id: null,
          gross: { $sum: '$amount' },
          refunded: { $sum: '$amountRefunded' },
        },
      },
      {
        $project: {
          _id: 0,
          net: { $max: [0, { $subtract: ['$gross', '$refunded'] }] },
        },
      },
    ];

    const results = await this._collection.aggregate(pipeline).toArray();
    if (results.length === 0) return 0;
    return (results[0]?.['net'] as number) ?? 0;
  }
}


