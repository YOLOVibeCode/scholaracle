import { Payment } from './Payment';
import type { ObjectId } from 'mongodb';

describe('Payment', () => {
  describe('constructor', () => {
    it('should create payment with required fields', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded' as const,
        paymentMethod: 'card' as const,
      };

      // Act
      const payment = new Payment(data);

      // Assert
      expect(payment.userId).toBe('user-123');
      expect(payment.amount).toBe(2999);
      expect(payment.currency).toBe('usd');
      expect(payment.status).toBe('succeeded');
      expect(payment.paymentMethod).toBe('card');
    });

    it('should set amountRefunded to 0 by default', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded' as const,
        paymentMethod: 'card' as const,
      };

      // Act
      const payment = new Payment(data);

      // Assert
      expect(payment.amountRefunded).toBe(0);
    });

    it('should set metadata to empty object by default', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded' as const,
        paymentMethod: 'card' as const,
      };

      // Act
      const payment = new Payment(data);

      // Assert
      expect(payment.metadata).toEqual({});
    });

    it('should set createdAt to current date by default', () => {
      // Arrange
      const before = new Date();
      const data = {
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded' as const,
        paymentMethod: 'card' as const,
      };

      // Act
      const payment = new Payment(data);
      const after = new Date();

      // Assert
      expect(payment.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(payment.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set updatedAt to current date by default', () => {
      // Arrange
      const before = new Date();
      const data = {
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded' as const,
        paymentMethod: 'card' as const,
      };

      // Act
      const payment = new Payment(data);
      const after = new Date();

      // Assert
      expect(payment.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(payment.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should use provided createdAt', () => {
      // Arrange
      const createdAt = new Date('2024-01-01');
      const data = {
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded' as const,
        paymentMethod: 'card' as const,
        createdAt,
      };

      // Act
      const payment = new Payment(data);

      // Assert
      expect(payment.createdAt).toEqual(createdAt);
    });

    it('should use provided updatedAt', () => {
      // Arrange
      const updatedAt = new Date('2024-06-15');
      const data = {
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded' as const,
        paymentMethod: 'card' as const,
        updatedAt,
      };

      // Act
      const payment = new Payment(data);

      // Assert
      expect(payment.updatedAt).toEqual(updatedAt);
    });

    it('should use provided amountRefunded', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'partially_refunded' as const,
        paymentMethod: 'card' as const,
        amountRefunded: 1000,
      };

      // Act
      const payment = new Payment(data);

      // Assert
      expect(payment.amountRefunded).toBe(1000);
    });

    it('should use provided metadata', () => {
      // Arrange
      const metadata = { planId: 'pro', coupon: 'SAVE20' };
      const data = {
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded' as const,
        paymentMethod: 'card' as const,
        metadata,
      };

      // Act
      const payment = new Payment(data);

      // Assert
      expect(payment.metadata).toEqual(metadata);
    });

    it('should accept optional card fields', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded' as const,
        paymentMethod: 'card' as const,
        last4: '4242',
        brand: 'visa' as const,
        expiryMonth: 12,
        expiryYear: 2026,
      };

      // Act
      const payment = new Payment(data);

      // Assert
      expect(payment.last4).toBe('4242');
      expect(payment.brand).toBe('visa');
      expect(payment.expiryMonth).toBe(12);
      expect(payment.expiryYear).toBe(2026);
    });

    it('should accept optional Stripe integration fields', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded' as const,
        paymentMethod: 'card' as const,
        stripePaymentIntentId: 'pi_abc123',
        stripeChargeId: 'ch_def456',
        stripeInvoiceId: 'in_ghi789',
      };

      // Act
      const payment = new Payment(data);

      // Assert
      expect(payment.stripePaymentIntentId).toBe('pi_abc123');
      expect(payment.stripeChargeId).toBe('ch_def456');
      expect(payment.stripeInvoiceId).toBe('in_ghi789');
    });

    it('should accept optional receipt fields', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded' as const,
        paymentMethod: 'card' as const,
        receiptUrl: 'https://pay.stripe.com/receipts/abc',
        receiptNumber: 'REC-001',
        invoiceNumber: 'INV-001',
      };

      // Act
      const payment = new Payment(data);

      // Assert
      expect(payment.receiptUrl).toBe('https://pay.stripe.com/receipts/abc');
      expect(payment.receiptNumber).toBe('REC-001');
      expect(payment.invoiceNumber).toBe('INV-001');
    });

    it('should accept optional refund detail fields', () => {
      // Arrange
      const refundedAt = new Date('2024-03-01');
      const data = {
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'refunded' as const,
        paymentMethod: 'card' as const,
        refundedAt,
        refundedBy: 'admin-456',
        refundReason: 'Customer request',
        refundId: 'ref_xyz789',
      };

      // Act
      const payment = new Payment(data);

      // Assert
      expect(payment.refundedAt).toEqual(refundedAt);
      expect(payment.refundedBy).toBe('admin-456');
      expect(payment.refundReason).toBe('Customer request');
      expect(payment.refundId).toBe('ref_xyz789');
    });

    it('should accept optional failure fields', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'failed' as const,
        paymentMethod: 'card' as const,
        failureReason: 'Insufficient funds',
        failureCode: 'card_declined',
      };

      // Act
      const payment = new Payment(data);

      // Assert
      expect(payment.failureReason).toBe('Insufficient funds');
      expect(payment.failureCode).toBe('card_declined');
    });

    it('should accept optional subscriptionId and description', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded' as const,
        paymentMethod: 'card' as const,
        subscriptionId: 'sub-456',
        description: 'Pro plan monthly subscription',
      };

      // Act
      const payment = new Payment(data);

      // Assert
      expect(payment.subscriptionId).toBe('sub-456');
      expect(payment.description).toBe('Pro plan monthly subscription');
    });

    it('should accept ObjectId for _id', () => {
      // Arrange
      const mockId = { toString: () => 'payment-123' } as unknown as ObjectId;
      const data = {
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded' as const,
        paymentMethod: 'card' as const,
      };

      // Act
      const payment = new Payment(data, mockId);

      // Assert
      expect(payment._id).toBe(mockId);
    });
  });

  describe('getNetAmount', () => {
    it('should return full amount when no refunds', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
      });

      // Act
      const netAmount = payment.getNetAmount();

      // Assert
      expect(netAmount).toBe(2999);
    });

    it('should return amount minus amountRefunded', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'partially_refunded',
        paymentMethod: 'card',
        amountRefunded: 1000,
      });

      // Act
      const netAmount = payment.getNetAmount();

      // Assert
      expect(netAmount).toBe(1999);
    });

    it('should return 0 when fully refunded', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'refunded',
        paymentMethod: 'card',
        amountRefunded: 2999,
      });

      // Act
      const netAmount = payment.getNetAmount();

      // Assert
      expect(netAmount).toBe(0);
    });
  });

  describe('isRefundable', () => {
    it('should return true for succeeded payment with no refunds', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
      });

      // Act
      const isRefundable = payment.isRefundable();

      // Assert
      expect(isRefundable).toBe(true);
    });

    it('should return true for succeeded payment with partial refund', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
        amountRefunded: 1000,
      });

      // Act
      const isRefundable = payment.isRefundable();

      // Assert
      expect(isRefundable).toBe(true);
    });

    it('should return false for succeeded payment fully refunded', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
        amountRefunded: 2999,
      });

      // Act
      const isRefundable = payment.isRefundable();

      // Assert
      expect(isRefundable).toBe(false);
    });

    it('should return false for pending payment', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'pending',
        paymentMethod: 'card',
      });

      // Act
      const isRefundable = payment.isRefundable();

      // Assert
      expect(isRefundable).toBe(false);
    });

    it('should return false for failed payment', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'failed',
        paymentMethod: 'card',
      });

      // Act
      const isRefundable = payment.isRefundable();

      // Assert
      expect(isRefundable).toBe(false);
    });

    it('should return false for refunded payment', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'refunded',
        paymentMethod: 'card',
      });

      // Act
      const isRefundable = payment.isRefundable();

      // Assert
      expect(isRefundable).toBe(false);
    });

    it('should return false for disputed payment', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'disputed',
        paymentMethod: 'card',
      });

      // Act
      const isRefundable = payment.isRefundable();

      // Assert
      expect(isRefundable).toBe(false);
    });
  });

  describe('getRefundableAmount', () => {
    it('should return full amount for succeeded payment with no refunds', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
      });

      // Act
      const refundable = payment.getRefundableAmount();

      // Assert
      expect(refundable).toBe(2999);
    });

    it('should return remaining amount for partially refunded succeeded payment', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
        amountRefunded: 1000,
      });

      // Act
      const refundable = payment.getRefundableAmount();

      // Assert
      expect(refundable).toBe(1999);
    });

    it('should return 0 for fully refunded succeeded payment', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
        amountRefunded: 2999,
      });

      // Act
      const refundable = payment.getRefundableAmount();

      // Assert
      expect(refundable).toBe(0);
    });

    it('should return 0 for non-refundable payment status', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'failed',
        paymentMethod: 'card',
      });

      // Act
      const refundable = payment.getRefundableAmount();

      // Assert
      expect(refundable).toBe(0);
    });
  });

  describe('formatAmount', () => {
    it('should format USD amount with dollar sign', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
      });

      // Act
      const formatted = payment.formatAmount();

      // Assert
      expect(formatted).toBe('$29.99');
    });

    it('should format whole dollar amount', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 10000,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
      });

      // Act
      const formatted = payment.formatAmount();

      // Assert
      expect(formatted).toBe('$100.00');
    });

    it('should format EUR amount with euro sign', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 4999,
        currency: 'eur',
        status: 'succeeded',
        paymentMethod: 'card',
      });

      // Act
      const formatted = payment.formatAmount();

      // Assert
      expect(formatted).toContain('49.99');
    });

    it('should handle uppercase currency code', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 2999,
        currency: 'USD',
        status: 'succeeded',
        paymentMethod: 'card',
      });

      // Act
      const formatted = payment.formatAmount();

      // Assert
      expect(formatted).toBe('$29.99');
    });
  });

  describe('getMaskedCard', () => {
    it('should return masked card with last4 digits', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
        last4: '4242',
      });

      // Act
      const masked = payment.getMaskedCard();

      // Assert
      expect(masked).toBe('•••• 4242');
    });

    it('should return N/A when last4 is not set', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'bank_transfer',
      });

      // Act
      const masked = payment.getMaskedCard();

      // Assert
      expect(masked).toBe('N/A');
    });

    it('should handle different last4 values', () => {
      // Arrange
      const payment = new Payment({
        userId: 'user-123',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
        last4: '1234',
      });

      // Act
      const masked = payment.getMaskedCard();

      // Assert
      expect(masked).toBe('•••• 1234');
    });
  });
});
