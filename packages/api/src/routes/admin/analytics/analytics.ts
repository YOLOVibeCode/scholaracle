import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { AnalyticsService } from '../../../services/AnalyticsService';
import { adminAuthMiddleware } from '../../../middleware/adminAuth';
import { AdminAuthService } from '@scholaracle/auth';

export interface IAnalyticsRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
}

async function handleGetOverview(
  _req: Request,
  res: Response,
  analyticsService: AnalyticsService
): Promise<void> {
  try {
    const [mrr, churnRate, arpu, customerStats] = await Promise.all([
      analyticsService.calculateMRR(),
      analyticsService.calculateChurnRate(),
      analyticsService.calculateARPU(),
      // Get customer statistics from UserRepository
      Promise.resolve({ totalUsers: 0, activeUsers: 0, newUsers: 0 }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        mrr,
        churnRate,
        arpu,
        totalCustomers: customerStats.totalUsers,
        activeCustomers: customerStats.activeUsers,
        newCustomers: customerStats.newUsers,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleGetRevenue(
  req: Request,
  res: Response,
  analyticsService: AnalyticsService
): Promise<void> {
  try {
    const period = (req.query['period'] as 'day' | 'week' | 'month' | 'year') || 'month';
    const startDateStr = req.query['startDate'] as string | undefined;
    const endDateStr = req.query['endDate'] as string | undefined;

    const startDate = startDateStr ? new Date(startDateStr) : new Date();
    startDate.setMonth(startDate.getMonth() - 1);
    const endDate = endDateStr ? new Date(endDateStr) : new Date();

    const revenue = await analyticsService.getRevenueByPeriod(period, startDate, endDate);

    res.status(200).json({
      success: true,
      data: revenue,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleGetCustomers(
  req: Request,
  res: Response,
  analyticsService: AnalyticsService
): Promise<void> {
  try {
    const period = (req.query['period'] as 'day' | 'week' | 'month' | 'year') || 'month';
    const months = parseInt((req.query['months'] as string) || '6') || 6;

    const growth = await analyticsService.getCustomerGrowth(period, months);

    res.status(200).json({
      success: true,
      data: growth,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleGetSubscriptions(
  req: Request,
  res: Response,
  analyticsService: AnalyticsService
): Promise<void> {
  try {
    const period = (req.query['period'] as 'day' | 'week' | 'month' | 'year') || 'month';
    const months = parseInt((req.query['months'] as string) || '6') || 6;

    const growth = await analyticsService.getSubscriptionGrowth(period, months);

    res.status(200).json({
      success: true,
      data: growth,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleGetChurn(
  _req: Request,
  res: Response,
  analyticsService: AnalyticsService
): Promise<void> {
  try {
    const churnRate = await analyticsService.calculateChurnRate();

    res.status(200).json({
      success: true,
      data: {
        churnRate,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

export function analyticsRouter(config: IAnalyticsRouterConfig): Router {
  const router = Router();
  const analyticsService = new AnalyticsService(config.database);
  const adminAuthService = new AdminAuthService(config.database, config.jwtSecret);

  // Apply admin auth middleware to all routes
  router.use(adminAuthMiddleware(adminAuthService));

  router.get('/overview', (req: Request, res: Response) => {
    void handleGetOverview(req, res, analyticsService);
  });

  router.get('/revenue', (req: Request, res: Response) => {
    void handleGetRevenue(req, res, analyticsService);
  });

  router.get('/customers', (req: Request, res: Response) => {
    void handleGetCustomers(req, res, analyticsService);
  });

  router.get('/subscriptions', (req: Request, res: Response) => {
    void handleGetSubscriptions(req, res, analyticsService);
  });

  router.get('/churn', (req: Request, res: Response) => {
    void handleGetChurn(req, res, analyticsService);
  });

  return router;
}

