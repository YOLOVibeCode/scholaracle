import type { Db } from 'mongodb';
import type { IStudentLoginAudit, IStudentLoginAuditEvent } from '@scholaracle/interfaces';

export const STUDENT_LOGIN_AUDIT_COLLECTION = 'student_login_audit';

const BLOCKED_METADATA_KEYS = new Set(['password', 'temporaryPassword', 'passwordHash']);

function sanitizeMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): Record<string, unknown> | undefined {
  if (metadata === undefined) {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (BLOCKED_METADATA_KEYS.has(key) || /password/i.test(key)) {
      continue;
    }
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Mongo writer for parent provision / revoke / showGrades.
 * Never persists passwords, even if a caller puts one in metadata.
 */
export class MongoStudentLoginAudit implements IStudentLoginAudit {
  private readonly _db: Db;

  constructor(database: Db) {
    this._db = database;
  }

  public async record(event: IStudentLoginAuditEvent): Promise<void> {
    const metadata = sanitizeMetadata(event.metadata);
    await this._db.collection(STUDENT_LOGIN_AUDIT_COLLECTION).insertOne({
      studentId: event.studentId,
      actorUserId: event.actorUserId,
      action: event.action,
      at: event.at,
      ...(metadata !== undefined ? { metadata } : {}),
    });
  }
}
