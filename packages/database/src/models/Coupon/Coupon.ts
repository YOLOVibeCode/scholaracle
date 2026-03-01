import type { ObjectId } from 'mongodb';
import type { SubscriptionPlan } from '../Subscription';

export type CouponType = 'trial_extension' | 'percent_off' | 'amount_off' | 'free_plan';

export type CouponDuration = 'once' | 'repeating' | 'forever';

export interface ICouponRedemption {
  readonly userId: string;
  readonly redeemedAt: Date;
  readonly subscriptionId?: string;
}

export interface ICouponData {
  readonly code: string;
  readonly type: CouponType;
  readonly value: number;
  readonly plan?: SubscriptionPlan;
  readonly duration: CouponDuration;
  readonly durationMonths?: number;
  readonly maxRedemptions?: number;
  readonly redemptionCount: number;
  readonly redemptions: readonly ICouponRedemption[];
  readonly expiresAt?: Date;
  readonly isActive: boolean;
  readonly description?: string;
  readonly createdBy?: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export class Coupon {
  public readonly _id?: ObjectId;
  public readonly code: string;
  public readonly type: CouponType;
  public readonly value: number;
  public readonly plan?: SubscriptionPlan;
  public readonly duration: CouponDuration;
  public readonly durationMonths?: number;
  public readonly maxRedemptions?: number;
  public readonly redemptionCount: number;
  public readonly redemptions: readonly ICouponRedemption[];
  public readonly expiresAt?: Date;
  public readonly isActive: boolean;
  public readonly description?: string;
  public readonly createdBy?: string;
  public readonly createdAt?: Date;
  public readonly updatedAt?: Date;

  constructor(data: ICouponData, id?: ObjectId) {
    this._id = id;
    this.code = data.code;
    this.type = data.type;
    this.value = data.value;
    this.plan = data.plan;
    this.duration = data.duration;
    this.durationMonths = data.durationMonths;
    this.maxRedemptions = data.maxRedemptions;
    this.redemptionCount = data.redemptionCount;
    this.redemptions = data.redemptions ?? [];
    this.expiresAt = data.expiresAt;
    this.isActive = data.isActive;
    this.description = data.description;
    this.createdBy = data.createdBy;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  get id(): string {
    return this._id?.toHexString() ?? '';
  }

  get isExpired(): boolean {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
  }

  get isExhausted(): boolean {
    if (!this.maxRedemptions) return false;
    return this.redemptionCount >= this.maxRedemptions;
  }

  get isValid(): boolean {
    return this.isActive && !this.isExpired && !this.isExhausted;
  }

  get remainingRedemptions(): number | null {
    if (!this.maxRedemptions) return null;
    return Math.max(0, this.maxRedemptions - this.redemptionCount);
  }

  discountLabel(): string {
    switch (this.type) {
      case 'percent_off':
        return `${this.value}% off`;
      case 'amount_off':
        return `$${(this.value / 100).toFixed(2)} off`;
      case 'trial_extension':
        return `${this.value} day${this.value === 1 ? '' : 's'} free trial`;
      case 'free_plan':
        return this.value === 0
          ? 'Free forever'
          : `Free for ${this.value} month${this.value === 1 ? '' : 's'}`;
      default:
        return '';
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      code: this.code,
      type: this.type,
      value: this.value,
      plan: this.plan ?? null,
      duration: this.duration,
      durationMonths: this.durationMonths ?? null,
      maxRedemptions: this.maxRedemptions ?? null,
      redemptionCount: this.redemptionCount,
      expiresAt: this.expiresAt?.toISOString() ?? null,
      isActive: this.isActive,
      isValid: this.isValid,
      isExpired: this.isExpired,
      isExhausted: this.isExhausted,
      remainingRedemptions: this.remainingRedemptions,
      discountLabel: this.discountLabel(),
      description: this.description ?? null,
      createdBy: this.createdBy ?? null,
      createdAt: this.createdAt?.toISOString() ?? null,
      updatedAt: this.updatedAt?.toISOString() ?? null,
    };
  }
}
