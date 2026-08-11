import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { ExportService } from '../../../services/ExportService';
import { adminAuthMiddleware } from '../../../middleware/adminAuth';
import { asyncHandler } from '../../../middleware/asyncHandler';
import { AdminAuthService } from '@scholaracle/auth';

export interface IReportsRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
}

async function handleExportCustomers(
  req: Request,
  res: Response,
  exportService: ExportService
): Promise<void> {
  const startDateStr = req.query['startDate'] as string | undefined;
  const endDateStr = req.query['endDate'] as string | undefined;

  const startDate = startDateStr ? new Date(startDateStr) : undefined;
  const endDate = endDateStr ? new Date(endDateStr) : undefined;

  const csv = await exportService.exportCustomers(startDate, endDate);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
  res.status(200).send(csv);
}

async function handleExportPayments(
  req: Request,
  res: Response,
  exportService: ExportService
): Promise<void> {
  const startDateStr = req.query['startDate'] as string | undefined;
  const endDateStr = req.query['endDate'] as string | undefined;

  const startDate = startDateStr ? new Date(startDateStr) : undefined;
  const endDate = endDateStr ? new Date(endDateStr) : undefined;

  const csv = await exportService.exportPayments(startDate, endDate);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="payments.csv"');
  res.status(200).send(csv);
}

async function handleExportSubscriptions(
  req: Request,
  res: Response,
  exportService: ExportService
): Promise<void> {
  const startDateStr = req.query['startDate'] as string | undefined;
  const endDateStr = req.query['endDate'] as string | undefined;

  const startDate = startDateStr ? new Date(startDateStr) : undefined;
  const endDate = endDateStr ? new Date(endDateStr) : undefined;

  const csv = await exportService.exportSubscriptions(startDate, endDate);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="subscriptions.csv"');
  res.status(200).send(csv);
}

export function reportsRouter(config: IReportsRouterConfig): Router {
  const router = Router();
  const exportService = new ExportService(config.database);
  const adminAuthService = new AdminAuthService(config.database, config.jwtSecret);

  // Apply admin auth middleware to all routes
  router.use(adminAuthMiddleware(adminAuthService));

  router.get(
    '/export/customers',
    asyncHandler((req: Request, res: Response) => handleExportCustomers(req, res, exportService))
  );

  router.get(
    '/export/payments',
    asyncHandler((req: Request, res: Response) => handleExportPayments(req, res, exportService))
  );

  router.get(
    '/export/subscriptions',
    asyncHandler((req: Request, res: Response) =>
      handleExportSubscriptions(req, res, exportService)
    )
  );

  return router;
}
