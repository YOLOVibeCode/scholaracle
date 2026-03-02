import type { Db } from 'mongodb';
import { UserRepository } from '@scholaracle/database';

// Plan pricing (matching User model subscription plans)
const PLAN_PRICING: Record<'free' | 'premium' | 'family', { monthly: number }> = {
  free: { monthly: 0 },
  premium: { monthly: 19 },
  family: { monthly: 29 },
};

/** Square Plus plan becomes cost-effective at ~150 paying users (saves ~$0.36/user on processing). */
export const SQUARE_PLUS_THRESHOLD = 150;

export interface ISquarePlusRecommendation {
  readonly payingUserCount: number;
  readonly threshold: number;
  readonly considerSquarePlus: boolean;
  readonly message?: string;
}

export interface IRevenueDataPoint {
  readonly period: string;
  readonly revenue: number;
  readonly count: number;
}

export interface IGrowthDataPoint {
  readonly period: string;
  readonly count: number;
  readonly change: number;
  readonly changePercent: number;
}

export interface IAnalyticsService {
  calculateMRR(): Promise<number>;
  calculateChurnRate(): Promise<number>;
  calculateARPU(): Promise<number>;
  getRevenueByPeriod(
    period: 'day' | 'week' | 'month' | 'year',
    startDate: Date,
    endDate: Date
  ): Promise<readonly IRevenueDataPoint[]>;
  getSubscriptionGrowth(
    period: 'day' | 'week' | 'month' | 'year',
    months: number
  ): Promise<readonly IGrowthDataPoint[]>;
  getCustomerGrowth(
    period: 'day' | 'week' | 'month' | 'year',
    months: number
  ): Promise<readonly IGrowthDataPoint[]>;
  countPayingUsers(): Promise<number>;
  getSquarePlusRecommendation(): Promise<ISquarePlusRecommendation>;
}

/**
 * Analytics service for business intelligence and reporting.
 */
export class AnalyticsService implements IAnalyticsService {
  private readonly _userRepository: UserRepository;
  private readonly _database: Db;

  constructor(database: Db) {
    this._database = database;
    this._userRepository = new UserRepository(database);
  }

  /**
   * Calculate Monthly Recurring Revenue (MRR).
   *
   * @returns MRR in dollars
   */
  public async calculateMRR(): Promise<number> {
    const users = await this._userRepository.findWithPagination({
      page: 1,
      limit: 10000,
      filters: {
        'subscription.status': 'active',
      },
    });

    let mrr = 0;

    for (const user of users.data) {
      const plan = user.subscription.plan;
      const pricing = PLAN_PRICING[plan];

      // Assume monthly billing for now (can be enhanced to check billingCycle)
      mrr += pricing.monthly;
    }

    return mrr;
  }

  /**
   * Calculate churn rate (percentage of cancelled subscriptions).
   *
   * @returns Churn rate as percentage (0-100)
   */
  public async calculateChurnRate(): Promise<number> {
    const [total, cancelled] = await Promise.all([
      this._database.collection('users').countDocuments({
        'subscription.status': { $in: ['active', 'cancelled', 'expired'] },
      }),
      this._database.collection('users').countDocuments({
        'subscription.status': { $in: ['cancelled', 'expired'] },
      }),
    ]);

    if (total === 0) return 0;

    return (cancelled / total) * 100;
  }

  /**
   * Calculate Average Revenue Per User (ARPU).
   *
   * @returns ARPU in dollars
   */
  public async calculateARPU(): Promise<number> {
    const mrr = await this.calculateMRR();
    const activeUsers = await this._database.collection('users').countDocuments({
      'subscription.status': 'active',
    });

    if (activeUsers === 0) return 0;

    return mrr / activeUsers;
  }

  /**
   * Get revenue by time period.
   *
   * @param period - Time period granularity
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Revenue data points
   */
  public async getRevenueByPeriod(
    period: 'day' | 'week' | 'month' | 'year',
    startDate: Date,
    endDate: Date
  ): Promise<readonly IRevenueDataPoint[]> {
    // This would typically query the payments collection
    // For now, return empty array as PaymentRepository needs to be implemented
    const paymentsCollection = this._database.collection('payments');

    const dateFormat: Record<string, string> = {
      day: '%Y-%m-%d',
      week: '%Y-%U',
      month: '%Y-%m',
      year: '%Y',
    };

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
          _id: {
            $dateToString: {
              format: dateFormat[period],
              date: '$createdAt',
            },
          },
          revenue: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
      {
        $project: {
          _id: 0,
          period: '$_id',
          revenue: { $divide: ['$revenue', 100] }, // Convert cents to dollars
          count: 1,
        },
      },
    ];

    const results = await paymentsCollection.aggregate(pipeline).toArray();
    return results as IRevenueDataPoint[];
  }

  /**
   * Get subscription growth over time.
   *
   * @param period - Time period granularity
   * @param months - Number of months to look back
   * @returns Growth data points
   */
  public async getSubscriptionGrowth(
    period: 'day' | 'week' | 'month' | 'year',
    months: number
  ): Promise<readonly IGrowthDataPoint[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const dateFormat: Record<string, string> = {
      day: '%Y-%m-%d',
      week: '%Y-%U',
      month: '%Y-%m',
      year: '%Y',
    };

    const pipeline = [
      {
        $match: {
          createdAt: {
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: dateFormat[period],
              date: '$createdAt',
            },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ];

    const results = await this._database.collection('users').aggregate(pipeline).toArray();

    const dataPoints: IGrowthDataPoint[] = [];
    let previousCount = 0;

    for (const result of results) {
      const currentCount = (result['count'] as number) ?? 0;
      const change = currentCount - previousCount;
      const changePercent = previousCount > 0 ? (change / previousCount) * 100 : 0;

      dataPoints.push({
        period: result['_id'] as string,
        count: currentCount,
        change,
        changePercent,
      });

      previousCount = currentCount;
    }

    return dataPoints;
  }

  /**
   * Get customer growth over time.
   *
   * @param period - Time period granularity
   * @param months - Number of months to look back
   * @returns Growth data points
   */
  public async getCustomerGrowth(
    period: 'day' | 'week' | 'month' | 'year',
    months: number
  ): Promise<readonly IGrowthDataPoint[]> {
    // Customer growth is the same as subscription growth for now
    // Can be enhanced to track unique customers vs subscriptions
    return this.getSubscriptionGrowth(period, months);
  }

  /**
   * Count users with an active paid subscription (plan !== free, status active or trialing).
   */
  public async countPayingUsers(): Promise<number> {
    return this._database.collection('users').countDocuments({
      'subscription.status': { $in: ['active', 'trialing'] },
      'subscription.plan': { $nin: ['free', null, ''] },
    });
  }

  /**
   * Recommendation for when Square Plus plan ($49/mo) becomes cost-effective (~150 paying users).
   */
  public async getSquarePlusRecommendation(): Promise<ISquarePlusRecommendation> {
    const payingUserCount = await this.countPayingUsers();
    const considerSquarePlus = payingUserCount >= SQUARE_PLUS_THRESHOLD;
    const message = considerSquarePlus
      ? `At ${payingUserCount} paying users, Square Plus ($49/mo) likely saves on processing fees. Evaluate upgrade.`
      : `${payingUserCount} paying users; consider Square Plus when you reach ${SQUARE_PLUS_THRESHOLD}.`;
    return {
      payingUserCount,
      threshold: SQUARE_PLUS_THRESHOLD,
      considerSquarePlus,
      message,
    };
  }
}
