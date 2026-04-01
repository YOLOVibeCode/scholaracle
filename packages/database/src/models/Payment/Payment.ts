import type { ObjectId } from 'mongodb';

/**
 * Payment status types.
 */
export type PaymentStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'disputed'
  | 'partially_refunded'
  | 'retry_pending';

/**
 * Payment method types.
 */
export type PaymentMethodType = 'card' | 'bank_transfer' | 'paypal';

/**
 * Card brand types.
 */
export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'other';

/**
 * Payment data interface.
 */
export interface IPaymentData {
  readonly userId: string;
  readonly subscriptionId?: string;

  // Amount
  readonly amount: number;
  readonly currency: string;
  readonly amountRefunded?: number;

  // Status
  readonly status: PaymentStatus;
  readonly failureReason?: string;
  readonly failureCode?: string;

  // Payment Details
  readonly paymentMethod: PaymentMethodType;
  readonly last4?: string;
  readonly brand?: CardBrand;
  readonly expiryMonth?: number;
  readonly expiryYear?: number;

  // Legacy Stripe integration (Square is primary)
  readonly stripePaymentIntentId?: string;
  readonly stripeChargeId?: string;
  readonly stripeInvoiceId?: string;

  // Square Integration
  readonly squarePaymentId?: string;
  readonly squareOrderId?: string;

  // Receipt
  readonly receiptUrl?: string;
  readonly receiptNumber?: string;
  readonly invoiceNumber?: string;

  // Refund Details
  readonly refundedAt?: Date;
  readonly refundedBy?: string;
  readonly refundReason?: string;
  readonly refundId?: string;

  // Metadata
  readonly description?: string;
  readonly metadata?: Record<string, unknown>;

  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * Payment model for transaction tracking.
 */
export class Payment {
  public readonly _id?: ObjectId;
  public readonly userId: string;
  public readonly subscriptionId?: string;
  public readonly amount: number;
  public readonly currency: string;
  public readonly amountRefunded: number;
  public readonly status: PaymentStatus;
  public readonly failureReason?: string;
  public readonly failureCode?: string;
  public readonly paymentMethod: PaymentMethodType;
  public readonly last4?: string;
  public readonly brand?: CardBrand;
  public readonly expiryMonth?: number;
  public readonly expiryYear?: number;
  public readonly stripePaymentIntentId?: string;
  public readonly stripeChargeId?: string;
  public readonly stripeInvoiceId?: string;
  public readonly squarePaymentId?: string;
  public readonly squareOrderId?: string;
  public readonly receiptUrl?: string;
  public readonly receiptNumber?: string;
  public readonly invoiceNumber?: string;
  public readonly refundedAt?: Date;
  public readonly refundedBy?: string;
  public readonly refundReason?: string;
  public readonly refundId?: string;
  public readonly description?: string;
  public readonly metadata: Record<string, unknown>;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(data: IPaymentData, id?: ObjectId) {
    this._id = id;
    this.userId = data.userId;
    this.subscriptionId = data.subscriptionId;
    this.amount = data.amount;
    this.currency = data.currency;
    this.amountRefunded = data.amountRefunded ?? 0;
    this.status = data.status;
    this.failureReason = data.failureReason;
    this.failureCode = data.failureCode;
    this.paymentMethod = data.paymentMethod;
    this.last4 = data.last4;
    this.brand = data.brand;
    this.expiryMonth = data.expiryMonth;
    this.expiryYear = data.expiryYear;
    this.stripePaymentIntentId = data.stripePaymentIntentId;
    this.stripeChargeId = data.stripeChargeId;
    this.stripeInvoiceId = data.stripeInvoiceId;
    this.squarePaymentId = data.squarePaymentId;
    this.squareOrderId = data.squareOrderId;
    this.receiptUrl = data.receiptUrl;
    this.receiptNumber = data.receiptNumber;
    this.invoiceNumber = data.invoiceNumber;
    this.refundedAt = data.refundedAt;
    this.refundedBy = data.refundedBy;
    this.refundReason = data.refundReason;
    this.refundId = data.refundId;
    this.description = data.description;
    this.metadata = data.metadata ?? {};
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
  }

  /**
   * Get net amount after refunds.
   */
  public getNetAmount(): number {
    return this.amount - this.amountRefunded;
  }

  /**
   * Check if payment is refundable.
   */
  public isRefundable(): boolean {
    return this.status === 'succeeded' && this.amountRefunded < this.amount;
  }

  /**
   * Get remaining refundable amount.
   */
  public getRefundableAmount(): number {
    if (!this.isRefundable()) return 0;
    return this.amount - this.amountRefunded;
  }

  /**
   * Format amount for display.
   */
  public formatAmount(): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.currency.toUpperCase(),
    }).format(this.amount / 100);
  }

  /**
   * Get masked card number.
   */
  public getMaskedCard(): string {
    if (!this.last4) return 'N/A';
    return `•••• ${this.last4}`;
  }
}
