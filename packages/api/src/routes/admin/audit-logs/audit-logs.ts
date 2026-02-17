import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { AdminAuthService } from '@scholaracle/auth';
import {
  adminAuthMiddleware,
  type IAdminAuthenticatedRequest,
} from '../../../middleware/adminAuth';
import { requireAdminStepUp } from '../../../middleware/adminStepUp';
import { AuditLogRepository } from '@scholaracle/database';
import { asyncHandler } from '../../../middleware/asyncHandler';

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function maskSensitive(value: unknown, depth: number = 0): unknown {
  if (depth > 6) return '[REDACTED]';

  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => maskSensitive(v, depth + 1));
  if (typeof value !== 'object') return value;

  const obj = value as Record<string, unknown>;
  const redactedKeys = new Set([
    'password',
    'passwordHash',
    'token',
    'accessToken',
    'refreshToken',
    'authorization',
    'auth',
    'secret',
    'mfaSecret',
    'otp',
    'totp',
    'apiKey',
    'apikey',
  ]);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase();
    if (
      redactedKeys.has(key) ||
      key.includes('token') ||
      key.includes('secret') ||
      key.includes('password') ||
      key.includes('authorization')
    ) {
      out[k] = '[REDACTED]';
      continue;
    }
    out[k] = maskSensitive(v, depth + 1);
  }
  return out;
}

export interface IAuditLogsRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
}

export function auditLogsRouter(config: IAuditLogsRouterConfig): Router {
  const router = Router();
  const adminAuthService = new AdminAuthService(config.database, config.jwtSecret);
  const auditLogRepository = new AuditLogRepository(config.database);

  router.use(adminAuthMiddleware(adminAuthService));

  router.get(
    '/export',
    requireAdminStepUp({ database: config.database, jwtSecret: config.jwtSecret }),
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const authReq = req as IAdminAuthenticatedRequest;

        const action = req.query['action'] as string | undefined;
        const entityType = req.query['entityType'] as string | undefined;
        const entityId = req.query['entityId'] as string | undefined;
        const adminEmail = req.query['adminEmail'] as string | undefined;
        const severity = req.query['severity'] as string | undefined;
        const from = req.query['from'] as string | undefined;
        const to = req.query['to'] as string | undefined;

        const filter: Record<string, unknown> = {};
        if (action) filter['action'] = action;
        if (entityType) filter['entityType'] = entityType;
        if (entityId) filter['entityId'] = entityId;
        if (adminEmail) filter['adminEmail'] = adminEmail;
        if (severity) filter['severity'] = severity;
        if (from || to) {
          const ts: Record<string, Date> = {};
          if (from) ts['$gte'] = new Date(from);
          if (to) ts['$lte'] = new Date(to);
          filter['timestamp'] = ts;
        }

        const collection = config.database.collection('audit_logs');
        const docs = await collection.find(filter).sort({ timestamp: -1 }).limit(5000).toArray();

        await auditLogRepository.create({
          adminUserId: authReq.adminId!,
          adminEmail: authReq.adminEmail!,
          action: 'system:export',
          entityType: 'audit_logs',
          entityId: '',
          reason: 'Exported audit logs',
          metadata: {
            filter,
            count: docs.length,
            format: 'csv',
          },
          ipAddress: req.ip ?? 'unknown',
          userAgent: req.headers['user-agent'] ?? 'unknown',
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');

        const header = 'timestamp,adminEmail,action,entityType,entityId,severity,reason\n';
        const rows = docs
          .map((d: Record<string, unknown>) => {
            const rawTs = d['timestamp'];
            const ts = (rawTs instanceof Date ? rawTs : new Date(String(rawTs))).toISOString();
            return [
              csvEscape(ts),
              csvEscape(d['adminEmail']),
              csvEscape(d['action']),
              csvEscape(d['entityType']),
              csvEscape(d['entityId'] ?? ''),
              csvEscape(d['severity'] ?? ''),
              csvEscape(d['reason'] ?? ''),
            ].join(',');
          })
          .join('\n');

        res.status(200).send(header + (rows ? `${rows}\n` : ''));
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error',
        });
      }
    })
  );

  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const page = parseInt((req.query['page'] as string) || '1') || 1;
        const limit = Math.min(parseInt((req.query['limit'] as string) || '25') || 25, 100);

        const action = req.query['action'] as string | undefined;
        const entityType = req.query['entityType'] as string | undefined;
        const entityId = req.query['entityId'] as string | undefined;
        const adminEmail = req.query['adminEmail'] as string | undefined;
        const severity = req.query['severity'] as string | undefined;
        const from = req.query['from'] as string | undefined;
        const to = req.query['to'] as string | undefined;

        const filter: Record<string, unknown> = {};
        if (action) filter['action'] = action;
        if (entityType) filter['entityType'] = entityType;
        if (entityId) filter['entityId'] = entityId;
        if (adminEmail) filter['adminEmail'] = adminEmail;
        if (severity) filter['severity'] = severity;
        if (from || to) {
          const ts: Record<string, Date> = {};
          if (from) ts['$gte'] = new Date(from);
          if (to) ts['$lte'] = new Date(to);
          filter['timestamp'] = ts;
        }

        const skip = (page - 1) * limit;
        const collection = config.database.collection('audit_logs');

        const [docs, total] = await Promise.all([
          collection.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).toArray(),
          collection.countDocuments(filter),
        ]);

        res.status(200).json({
          success: true,
          data: docs.map((d) => ({
            id: d._id?.toString(),
            adminUserId: d['adminUserId'],
            adminEmail: d['adminEmail'],
            action: d['action'],
            severity: d['severity'],
            entityType: d['entityType'],
            entityId: d['entityId'],
            reason: d['reason'],
            metadata: maskSensitive(d['metadata']),
            ipAddress: d['ipAddress'],
            userAgent: d['userAgent'],
            timestamp: (d['timestamp'] instanceof Date
              ? d['timestamp']
              : new Date(String(d['timestamp']))
            ).toISOString(),
          })),
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error',
        });
      }
    })
  );

  return router;
}
