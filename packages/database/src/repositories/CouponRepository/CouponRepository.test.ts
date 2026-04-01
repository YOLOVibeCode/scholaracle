import { MongoClient, type Db } from 'mongodb';
import { CouponRepository } from './CouponRepository';
import { Coupon, type ICouponData } from '../../models/Coupon';

describe('CouponRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repository: CouponRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repository = new CouponRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('coupons').deleteMany({});
  });

  const makeCouponData = (overrides: Partial<ICouponData> = {}): ICouponData => ({
    code: 'TESTCODE',
    type: 'percent_off',
    value: 20,
    duration: 'once',
    isActive: true,
    redemptionCount: 0,
    redemptions: [],
    ...overrides,
  });

  describe('create', () => {
    it('creates a coupon and returns a Coupon instance', async () => {
      const coupon = await repository.create(makeCouponData());

      expect(coupon).toBeInstanceOf(Coupon);
      expect(coupon._id).toBeDefined();
      expect(coupon.code).toBe('TESTCODE');
      expect(coupon.type).toBe('percent_off');
      expect(coupon.value).toBe(20);
    });

    it('uppercases and trims the code', async () => {
      const coupon = await repository.create(makeCouponData({ code: '  summer sale  ' }));
      expect(coupon.code).toBe('SUMMER SALE');
    });

    it('sets createdAt and updatedAt timestamps', async () => {
      const before = new Date();
      const coupon = await repository.create(makeCouponData());
      const after = new Date();

      expect(coupon.createdAt).toBeInstanceOf(Date);
      expect(coupon.createdAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(coupon.createdAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('initializes redemptionCount to 0', async () => {
      const coupon = await repository.create(makeCouponData({ redemptionCount: 5 }));
      expect(coupon.redemptionCount).toBe(0);
    });

    it('persists the coupon to the database', async () => {
      const coupon = await repository.create(makeCouponData({ code: 'PERSIST' }));
      const found = await repository.findByCode('PERSIST');

      expect(found).not.toBeNull();
      expect(found?.id).toBe(coupon.id);
    });
  });

  describe('validateCode', () => {
    it('returns valid: true for an active, non-expired coupon', async () => {
      await repository.create(makeCouponData({ code: 'VALID20' }));

      const result = await repository.validateCode('VALID20');
      expect(result.valid).toBe(true);
      expect(result.coupon).toBeInstanceOf(Coupon);
      expect(result.error).toBeUndefined();
    });

    it('returns valid: false with error for non-existent code', async () => {
      const result = await repository.validateCode('DOESNOTEXIST');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Coupon not found');
      expect(result.coupon).toBeUndefined();
    });

    it('returns valid: false for an inactive coupon', async () => {
      await repository.create(makeCouponData({ code: 'INACTIVE', isActive: false }));

      const result = await repository.validateCode('INACTIVE');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Coupon is inactive');
      expect(result.coupon).toBeDefined();
    });

    it('returns valid: false for an expired coupon', async () => {
      await repository.create(
        makeCouponData({
          code: 'EXPIRED',
          expiresAt: new Date('2020-01-01'),
        })
      );

      const result = await repository.validateCode('EXPIRED');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Coupon has expired');
    });

    it('returns valid: false for an exhausted coupon', async () => {
      const coupon = await repository.create(
        makeCouponData({
          code: 'MAXED',
          maxRedemptions: 1,
        })
      );
      // create() resets redemptionCount to 0, so simulate a redemption via direct DB update
      await database
        .collection('coupons')
        .updateOne({ _id: coupon._id }, { $set: { redemptionCount: 1 } });

      const result = await repository.validateCode('MAXED');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Coupon has reached maximum redemptions');
    });

    it('is case-insensitive when looking up codes', async () => {
      await repository.create(makeCouponData({ code: 'CASEFREE' }));

      const result = await repository.validateCode('casefree');
      expect(result.valid).toBe(true);
    });
  });
});
