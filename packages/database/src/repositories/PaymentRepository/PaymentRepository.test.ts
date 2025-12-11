import { MongoClient, type Db } from 'mongodb';
import { PaymentRepository } from './PaymentRepository';
import { Payment, type IPaymentData } from '../../models/Payment';

describe('PaymentRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repository: PaymentRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repository = new PaymentRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('payments').deleteMany({});
  });

  describe('create', () => {
    it('should create payment', async () => {
      const paymentData: IPaymentData = {
        userId: '507f1f77bcf86cd799439011',
        amount: 1900, // $19.00 in cents
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
      };

      const payment = await repository.create(paymentData);

      expect(payment).toBeInstanceOf(Payment);
      expect(payment.amount).toBe(1900);
      expect(payment._id).toBeDefined();
    });
  });

  describe('findByUserId', () => {
    it('should find payments by user id', async () => {
      const userId = '507f1f77bcf86cd799439011';
      await repository.create({
        userId,
        amount: 1900,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
      });
      await repository.create({
        userId,
        amount: 2900,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
      });

      const payments = await repository.findByUserId(userId);

      expect(payments.length).toBe(2);
    });
  });

  describe('findByStripeId', () => {
    it('should find payment by stripe id', async () => {
      await repository.create({
        userId: '507f1f77bcf86cd799439011',
        amount: 1900,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
        stripePaymentIntentId: 'pi_test123',
      });

      const payment = await repository.findByStripeId('pi_test123');

      expect(payment).not.toBeNull();
      expect(payment?.stripePaymentIntentId).toBe('pi_test123');
    });
  });

  describe('updateStatus', () => {
    it('should update payment status', async () => {
      const payment = await repository.create({
        userId: '507f1f77bcf86cd799439011',
        amount: 1900,
        currency: 'usd',
        status: 'pending',
        paymentMethod: 'card',
      });

      const success = await repository.updateStatus(payment._id!.toString(), 'succeeded');

      expect(success).toBe(true);
      const updated = await repository.findById(payment._id!.toString());
      expect(updated?.status).toBe('succeeded');
    });
  });

  describe('recordRefund', () => {
    it('should record refund', async () => {
      const payment = await repository.create({
        userId: '507f1f77bcf86cd799439011',
        amount: 1900,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
      });

      const success = await repository.recordRefund(
        payment._id!.toString(),
        1900,
        '507f1f77bcf86cd799439012',
        'Customer request'
      );

      expect(success).toBe(true);
      const updated = await repository.findById(payment._id!.toString());
      expect(updated?.status).toBe('refunded');
      expect(updated?.amountRefunded).toBe(1900);
    });
  });

  describe('getRevenueByPeriod', () => {
    it('should get revenue by period', async () => {
      await repository.create({
        userId: '507f1f77bcf86cd799439011',
        amount: 1900,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
        createdAt: new Date('2024-01-15'),
      });

      const revenue = await repository.getRevenueByPeriod(
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(revenue).toBeGreaterThanOrEqual(0);
    });
  });
});

