import type { Request } from 'express';
import type { Db } from 'mongodb';
import { AuditLogRepository, type AuditAction } from '@scholaracle/database';
import { getUserEmail, getUserId } from './sharingIdentity';

/** The subset of audit actions that describe sharing a student with other adults. */
export type SharingAuditAction = Extract<AuditAction, `sharing:${string}`>;

/** Who acted. Defaults to the JWT identity; the public magic-link route passes it explicitly. */
export interface ISharingActor {
  readonly userId: string;
  readonly email: string;
}

export type SharingAuditRecorder = (
  req: Request,
  action: SharingAuditAction,
  studentId: string,
  targetEmail: string,
  metadata?: Record<string, unknown>,
  actor?: ISharingActor
) => Promise<void>;

/**
 * Best-effort audit trail for sharing changes; never fails the request.
 * The actor is a PARENT (owner, admin, or the invitee), recorded in the adminUserId/adminEmail
 * fields so support can answer "who removed Robert from Ava?".
 */
export function createSharingAuditRecorder(database: Db): SharingAuditRecorder {
  const auditLogRepository = new AuditLogRepository(database);
  return async (req, action, studentId, targetEmail, metadata = {}, actor): Promise<void> => {
    try {
      await auditLogRepository.create({
        adminUserId: actor?.userId ?? getUserId(req) ?? 'unknown',
        adminEmail: actor?.email ?? getUserEmail(req) ?? 'unknown',
        action,
        entityType: 'student_sharing',
        entityId: studentId,
        entityDescription: targetEmail,
        metadata,
        ipAddress: req.ip ?? '',
        userAgent: req.get('user-agent') ?? '',
      });
    } catch (err) {
      console.error('[sharing] audit write failed', err);
    }
  };
}
