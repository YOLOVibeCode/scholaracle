import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { AdminAuthService } from '@scholaracle/auth';
import { adminAuthMiddleware, type IAdminAuthenticatedRequest } from '../../../middleware/adminAuth';
import { AuditLogRepository, CommunicationBatchRepository, CommunicationLogRepository, CommunicationTemplateRepository, UserRepository } from '@scholaracle/database';
import { requireAdminStepUp } from '../../../middleware/adminStepUp';

export interface ICommunicationsRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
}

function hasCommsAccess(role?: string): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'support';
}

function hasBulkAccess(role?: string): boolean {
  return role === 'super_admin' || role === 'admin';
}

export function communicationsRouter(config: ICommunicationsRouterConfig): Router {
  const router = Router();
  const adminAuthService = new AdminAuthService(config.database, config.jwtSecret);
  const userRepository = new UserRepository(config.database);
  const commLogRepository = new CommunicationLogRepository(config.database);
  const templateRepository = new CommunicationTemplateRepository(config.database);
  const batchRepository = new CommunicationBatchRepository(config.database);
  const auditLogRepository = new AuditLogRepository(config.database);

  router.use(adminAuthMiddleware(adminAuthService));

  // GET /api/admin/communications/batches
  router.get('/batches', async (req: Request, res: Response) => {
    try {
      const authReq = req as IAdminAuthenticatedRequest;
      if (!hasBulkAccess(authReq.adminRole)) {
        res.status(403).json({ success: false, error: 'Insufficient permissions' });
        return;
      }

      const batches = await batchRepository.findAll(50);
      res.status(200).json({
        success: true,
        data: batches.map((b) => ({
          id: b._id?.toString(),
          status: b.status,
          criteria: b.criteria,
          channel: b.channel,
          type: b.type,
          subject: b.subject,
          templateId: b.templateId,
          templateName: b.templateName,
          totalRecipients: b.totalRecipients,
          sentCount: b.sentCount,
          failedCount: b.failedCount,
          createdAt: b.createdAt.toISOString(),
          completedAt: b.completedAt ? b.completedAt.toISOString() : undefined,
        })),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  // GET /api/admin/communications/batches/:id
  router.get('/batches/:id', async (req: Request, res: Response) => {
    try {
      const authReq = req as IAdminAuthenticatedRequest;
      if (!hasBulkAccess(authReq.adminRole)) {
        res.status(403).json({ success: false, error: 'Insufficient permissions' });
        return;
      }

      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: 'id is required' });
        return;
      }

      const batch = await batchRepository.findById(id);
      if (!batch) {
        res.status(404).json({ success: false, error: 'Batch not found' });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          id: batch._id?.toString(),
          status: batch.status,
          criteria: batch.criteria,
          channel: batch.channel,
          type: batch.type,
          subject: batch.subject,
          content: batch.content,
          templateId: batch.templateId,
          templateName: batch.templateName,
          totalRecipients: batch.totalRecipients,
          sentCount: batch.sentCount,
          failedCount: batch.failedCount,
          createdAt: batch.createdAt.toISOString(),
          startedAt: batch.startedAt ? batch.startedAt.toISOString() : undefined,
          completedAt: batch.completedAt ? batch.completedAt.toISOString() : undefined,
          updatedAt: batch.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  // POST /api/admin/communications/bulk-send
  router.post('/bulk-send', requireAdminStepUp({ database: config.database, jwtSecret: config.jwtSecret }), async (req: Request, res: Response) => {
    try {
      const authReq = req as IAdminAuthenticatedRequest;
      if (!hasBulkAccess(authReq.adminRole)) {
        res.status(403).json({ success: false, error: 'Insufficient permissions' });
        return;
      }

      const { criteria, subject, content, templateId } = req.body as {
        criteria?: { role?: string; emails?: readonly string[] };
        subject?: string;
        content?: string;
        templateId?: string;
      };

      if (!criteria || (!criteria.role && (!criteria.emails || criteria.emails.length === 0))) {
        res.status(400).json({ success: false, error: 'criteria.role or criteria.emails is required' });
        return;
      }

      let finalSubject = subject ?? '(no subject)';
      let finalContent = content ?? '';
      let templateName: string | undefined;

      if (templateId) {
        const template = await templateRepository.findById(templateId);
        if (!template) {
          res.status(404).json({ success: false, error: 'Template not found' });
          return;
        }
        finalSubject = template.subject;
        finalContent = template.content;
        templateName = template.name;
      }

      if (!finalContent) {
        res.status(400).json({ success: false, error: 'content is required (or choose a template)' });
        return;
      }

      // Resolve recipients (MVP safety cap)
      let recipients: Array<{ id: string; email: string }> = [];
      if (criteria.emails && criteria.emails.length > 0) {
        const unique = Array.from(new Set(criteria.emails)).slice(0, 50);
        for (const email of unique) {
          const u = await userRepository.findByEmail(email);
          if (u && u._id) recipients.push({ id: u._id.toString(), email: u.email });
        }
      } else if (criteria.role) {
        // Note: User accounts represent parents/guardians and do not have a "role" field.
        // Treat role="parent" as "all users" for segmentation.
        if (criteria.role !== 'parent' && criteria.role !== 'all') {
          res.status(400).json({ success: false, error: 'Unsupported role segment for users' });
          return;
        }

        const docs = await config.database.collection('users').find({}).limit(50).toArray();
        recipients = docs
          .filter((d: any) => !!d._id && !!d.email)
          .map((d: any) => ({ id: d._id.toString(), email: d.email }));
      }

      if (recipients.length === 0) {
        res.status(400).json({ success: false, error: 'No recipients matched criteria' });
        return;
      }

      const now = new Date();
      const batch = await batchRepository.create({
        status: 'processing',
        criteria,
        channel: 'email',
        type: 'support',
        subject: finalSubject,
        content: finalContent,
        templateId,
        templateName,
        totalRecipients: recipients.length,
        sentCount: 0,
        failedCount: 0,
        createdByAdminId: authReq.adminId,
        createdByAdminEmail: authReq.adminEmail,
        createdAt: now,
        startedAt: now,
      });

      let sentCount = 0;
      let failedCount = 0;
      for (const r of recipients) {
        try {
          await commLogRepository.create({
            userId: r.id,
            channel: 'email',
            type: 'support',
            subject: finalSubject,
            content: finalContent,
            templateId,
            templateName,
            recipientEmail: r.email,
            status: 'sent',
            sentAt: new Date(),
            triggeredBy: 'admin',
            adminUserId: authReq.adminId,
            createdAt: new Date(),
            relatedEntityType: 'communication_batch',
            relatedEntityId: batch._id?.toString(),
          });
          sentCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      await batchRepository.update(batch._id!.toString(), {
        status: failedCount > 0 ? 'completed' : 'completed',
        sentCount,
        failedCount,
        completedAt: new Date(),
      });

      await auditLogRepository.create({
        adminUserId: authReq.adminId!,
        adminEmail: authReq.adminEmail!,
        action: 'communication:bulk_send',
        entityType: 'communication_batch',
        entityId: batch._id?.toString(),
        reason: 'Bulk send created',
        metadata: { criteria, totalRecipients: recipients.length, templateId, templateName },
        ipAddress: req.ip ?? 'unknown',
        userAgent: req.headers['user-agent'] ?? 'unknown',
      });

      res.status(200).json({ success: true, data: { batchId: batch._id?.toString() } });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  // GET /api/admin/communications/templates
  router.get('/templates', async (req: Request, res: Response) => {
    try {
      const authReq = req as IAdminAuthenticatedRequest;
      if (!hasCommsAccess(authReq.adminRole)) {
        res.status(403).json({ success: false, error: 'Insufficient permissions' });
        return;
      }

      const templates = await templateRepository.findAll();
      res.status(200).json({
        success: true,
        data: templates.map((t) => ({
          id: t._id?.toString(),
          name: t.name,
          channel: t.channel,
          type: t.type,
          subject: t.subject,
          content: t.content,
          isActive: t.isActive,
          createdByAdminId: t.createdByAdminId,
          createdByAdminEmail: t.createdByAdminEmail,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        })),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  // POST /api/admin/communications/templates
  router.post('/templates', async (req: Request, res: Response) => {
    try {
      const authReq = req as IAdminAuthenticatedRequest;
      if (!hasCommsAccess(authReq.adminRole)) {
        res.status(403).json({ success: false, error: 'Insufficient permissions' });
        return;
      }

      const { name, channel, type, subject, content } = req.body as {
        name?: string;
        channel?: string;
        type?: string;
        subject?: string;
        content?: string;
      };

      if (!name || !channel || !type || !subject || !content) {
        res.status(400).json({ success: false, error: 'name, channel, type, subject, content are required' });
        return;
      }

      const created = await templateRepository.create({
        name,
        channel: channel as any,
        type: type as any,
        subject,
        content,
        createdByAdminId: authReq.adminId,
        createdByAdminEmail: authReq.adminEmail,
      });

      await auditLogRepository.create({
        adminUserId: authReq.adminId!,
        adminEmail: authReq.adminEmail!,
        action: 'system:config_change',
        entityType: 'communication_template',
        entityId: created._id?.toString(),
        reason: 'Created communication template',
        metadata: { name, channel, type },
        ipAddress: req.ip ?? 'unknown',
        userAgent: req.headers['user-agent'] ?? 'unknown',
      });

      res.status(200).json({ success: true, data: { id: created._id?.toString() } });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  // PUT /api/admin/communications/templates/:id
  router.put('/templates/:id', async (req: Request, res: Response) => {
    try {
      const authReq = req as IAdminAuthenticatedRequest;
      if (!hasCommsAccess(authReq.adminRole)) {
        res.status(403).json({ success: false, error: 'Insufficient permissions' });
        return;
      }

      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: 'id is required' });
        return;
      }

      const updates = req.body as { name?: string; subject?: string; content?: string; isActive?: boolean };
      const ok = await templateRepository.update(id, updates as any);
      if (!ok) {
        res.status(404).json({ success: false, error: 'Template not found' });
        return;
      }

      await auditLogRepository.create({
        adminUserId: authReq.adminId!,
        adminEmail: authReq.adminEmail!,
        action: 'system:config_change',
        entityType: 'communication_template',
        entityId: id,
        reason: 'Updated communication template',
        metadata: updates as Record<string, unknown>,
        ipAddress: req.ip ?? 'unknown',
        userAgent: req.headers['user-agent'] ?? 'unknown',
      });

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  // GET /api/admin/communications/logs
  router.get('/logs', async (req: Request, res: Response) => {
    try {
      const authReq = req as IAdminAuthenticatedRequest;
      if (!hasCommsAccess(authReq.adminRole)) {
        res.status(403).json({ success: false, error: 'Insufficient permissions' });
        return;
      }

      const userId = req.query['userId'] as string | undefined;
      const recipientEmail = req.query['recipientEmail'] as string | undefined;
      const status = req.query['status'] as string | undefined;
      const channel = req.query['channel'] as string | undefined;
      const type = req.query['type'] as string | undefined;
      const page = parseInt((req.query['page'] as string) || '1') || 1;
      const limit = Math.min(parseInt((req.query['limit'] as string) || '25') || 25, 100);
      const skip = (page - 1) * limit;

      const filter: Record<string, unknown> = {};
      if (userId) filter['userId'] = userId;
      if (recipientEmail) filter['recipientEmail'] = recipientEmail;
      if (status) filter['status'] = status;
      if (channel) filter['channel'] = channel;
      if (type) filter['type'] = type;

      const collection = config.database.collection('communication_logs');
      const [docs, total] = await Promise.all([
        collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
        collection.countDocuments(filter),
      ]);

      res.status(200).json({
        success: true,
        data: docs.map((d: any) => ({
          id: d._id?.toString(),
          userId: d.userId,
          channel: d.channel,
          type: d.type,
          subject: d.subject,
          content: d.content,
          templateId: d.templateId,
          templateName: d.templateName,
          recipientEmail: d.recipientEmail,
          status: d.status,
          createdAt: (d.createdAt instanceof Date ? d.createdAt : new Date(d.createdAt)).toISOString(),
          sentAt: d.sentAt ? (d.sentAt instanceof Date ? d.sentAt : new Date(d.sentAt)).toISOString() : undefined,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  // GET /api/admin/communications/analytics
  router.get('/analytics', async (req: Request, res: Response) => {
    try {
      const authReq = req as IAdminAuthenticatedRequest;
      if (!hasBulkAccess(authReq.adminRole)) {
        res.status(403).json({ success: false, error: 'Insufficient permissions' });
        return;
      }

      const days = Math.min(parseInt((req.query['days'] as string) || '30') || 30, 365);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const collection = config.database.collection('communication_logs');

      const [total, sent, delivered, opened, clicked, failed, bounced] = await Promise.all([
        collection.countDocuments({ createdAt: { $gte: since } }),
        collection.countDocuments({ createdAt: { $gte: since }, status: 'sent' }),
        collection.countDocuments({ createdAt: { $gte: since }, status: 'delivered' }),
        collection.countDocuments({ createdAt: { $gte: since }, status: 'opened' }),
        collection.countDocuments({ createdAt: { $gte: since }, status: 'clicked' }),
        collection.countDocuments({ createdAt: { $gte: since }, status: 'failed' }),
        collection.countDocuments({ createdAt: { $gte: since }, status: 'bounced' }),
      ]);

      const deliveredOrBetter = delivered + opened + clicked;
      const deliveryRate = total > 0 ? deliveredOrBetter / total : 0;
      const openRate = deliveredOrBetter > 0 ? opened / deliveredOrBetter : 0;
      const clickRate = deliveredOrBetter > 0 ? clicked / deliveredOrBetter : 0;

      res.status(200).json({
        success: true,
        data: {
          days,
          total,
          sent,
          delivered,
          opened,
          clicked,
          failed,
          bounced,
          deliveryRate,
          openRate,
          clickRate,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  // POST /api/admin/communications/send
  router.post('/send', async (req: Request, res: Response) => {
    try {
      const authReq = req as IAdminAuthenticatedRequest;
      if (!hasCommsAccess(authReq.adminRole)) {
        res.status(403).json({ success: false, error: 'Insufficient permissions' });
        return;
      }

      const { recipientEmail, subject, content, templateId } = req.body as {
        recipientEmail?: string;
        subject?: string;
        content?: string;
        templateId?: string;
      };

      if (!recipientEmail) {
        res.status(400).json({ success: false, error: 'recipientEmail is required' });
        return;
      }

      const user = await userRepository.findByEmail(recipientEmail);
      if (!user || !user._id) {
        res.status(404).json({ success: false, error: 'Recipient user not found' });
        return;
      }

      let finalSubject = subject ?? '(no subject)';
      let finalContent = content ?? '';
      let templateName: string | undefined;

      if (templateId) {
        const template = await templateRepository.findById(templateId);
        if (!template) {
          res.status(404).json({ success: false, error: 'Template not found' });
          return;
        }
        finalSubject = template.subject;
        finalContent = template.content;
        templateName = template.name;
      }

      if (!finalContent) {
        res.status(400).json({ success: false, error: 'content is required' });
        return;
      }

      const now = new Date();
      const log = await commLogRepository.create({
        userId: user._id.toString(),
        channel: 'email',
        type: 'support',
        subject: finalSubject,
        content: finalContent,
        templateId,
        templateName,
        recipientEmail,
        status: 'sent',
        sentAt: now,
        triggeredBy: 'admin',
        adminUserId: authReq.adminId,
        createdAt: now,
      });

      // Audit log
      await auditLogRepository.create({
        adminUserId: authReq.adminId!,
        adminEmail: authReq.adminEmail!,
        action: 'communication:send',
        entityType: 'communication',
        entityId: log._id?.toString(),
        reason: finalSubject ?? 'Admin sent communication',
        metadata: { recipientEmail, templateId, templateName },
        ipAddress: req.ip ?? 'unknown',
        userAgent: req.headers['user-agent'] ?? 'unknown',
      });

      res.status(200).json({ success: true, data: { id: log._id?.toString() } });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  return router;
}


