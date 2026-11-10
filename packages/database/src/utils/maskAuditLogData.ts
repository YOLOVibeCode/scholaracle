import { maskPiiDeep } from '@scholaracle/contracts';
import type { IAuditLogData } from '../models/AuditLog';

/** Apply PII masking before persisting an audit log. */
export function maskAuditLogData(data: IAuditLogData): IAuditLogData {
  return maskPiiDeep(data) as IAuditLogData;
}
