import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { PaymentRepository } from '@scholaracle/database';
import { AdminAuthService } from '@scholaracle/auth';
import { adminAuthMiddleware } from '../../../middleware/adminAuth';

export interface IInvoicesRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
}

/**
 * POST /api/admin/invoices/:id/send
 * Send (resend) invoice to customer by payment/invoice id.
 */
async function handleSendInvoice(
  req: Request,
  res: Response,
  paymentRepository: PaymentRepository
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ success: false, error: 'Invoice ID is required' });
      return;
    }

    const payment = await paymentRepository.findById(id);
    if (!payment) {
      res.status(404).json({ success: false, error: 'Invoice not found' });
      return;
    }

    // Stub: in a full implementation, trigger email with invoice/payment details
    // await emailSender.sendInvoice(payment.userId, payment);
    res.status(200).json({
      success: true,
      message: 'Invoice send requested',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

export function invoicesRouter(config: IInvoicesRouterConfig): Router {
  const router = Router();
  const paymentRepository = new PaymentRepository(config.database);
  const adminAuthService = new AdminAuthService(config.database, config.jwtSecret);

  router.use(adminAuthMiddleware(adminAuthService));

  router.post('/:id/send', (req: Request, res: Response) => {
    void handleSendInvoice(req, res, paymentRepository);
  });

  return router;
}
