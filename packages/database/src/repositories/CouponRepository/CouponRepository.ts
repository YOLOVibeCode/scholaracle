import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';
import { Coupon, type ICouponData } from '../../models/Coupon';

export class CouponRepository {
  private readonly _collection: Collection<ICouponData & { _id?: ObjectId }>;

  constructor(database: Db) {
    this._collection = database.collection<ICouponData & { _id?: ObjectId }>('coupons');
  }

  async create(data: ICouponData): Promise<Coupon> {
    const now = new Date();
    const document = {
      ...data,
      code: data.code.toUpperCase().trim(),
      redemptionCount: 0,
      redemptions: [],
      createdAt: now,
      updatedAt: now,
    };

    const result = await this._collection.insertOne(document);
    return new Coupon(document, result.insertedId);
  }

  async findByCode(code: string): Promise<Coupon | null> {
    const document = await this._collection.findOne({ code: code.toUpperCase().trim() });
    if (!document || !document._id) return null;
    return new Coupon(document, document._id);
  }

  async findById(id: string): Promise<Coupon | null> {
    const document = await this._collection.findOne({ _id: new ObjectId(id) });
    if (!document || !document._id) return null;
    return new Coupon(document, document._id);
  }

  async findAll(filters: Record<string, unknown> = {}): Promise<readonly Coupon[]> {
    const documents = await this._collection
      .find(filters)
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    return documents.map((doc) => new Coupon(doc, doc._id));
  }

  async update(id: string, updates: Partial<ICouponData>): Promise<Coupon | null> {
    const result = await this._collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!result || !result._id) return null;
    return new Coupon(result, result._id);
  }

  async setActive(id: string, isActive: boolean): Promise<boolean> {
    const result = await this._collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { isActive, updatedAt: new Date() } }
    );
    return result.modifiedCount > 0;
  }

  async recordRedemption(
    code: string,
    userId: string,
    subscriptionId?: string
  ): Promise<Coupon | null> {
    const redemption = {
      userId,
      redeemedAt: new Date(),
      ...(subscriptionId ? { subscriptionId } : {}),
    };

    const result = await this._collection.findOneAndUpdate(
      { code: code.toUpperCase().trim() },
      {
        $inc: { redemptionCount: 1 },
        $push: { redemptions: redemption } as never,
        $set: { updatedAt: new Date() },
      },
      { returnDocument: 'after' }
    );

    if (!result || !result._id) return null;
    return new Coupon(result, result._id);
  }

  async validateCode(code: string): Promise<{ valid: boolean; coupon?: Coupon; error?: string }> {
    const coupon = await this.findByCode(code);
    if (!coupon) return { valid: false, error: 'Coupon not found' };
    if (!coupon.isActive) return { valid: false, coupon, error: 'Coupon is inactive' };
    if (coupon.isExpired) return { valid: false, coupon, error: 'Coupon has expired' };
    if (coupon.isExhausted)
      return { valid: false, coupon, error: 'Coupon has reached maximum redemptions' };
    return { valid: true, coupon };
  }
}
