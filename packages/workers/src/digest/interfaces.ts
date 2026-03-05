/**
 * Interfaces for digest and sync operations (ISP — M2).
 * Small, focused interfaces per concern.
 */

import type { IEmailDigestPendingItem } from '@scholaracle/database';
import type { IEmailTransport as IAgentsEmailTransport } from '@scholaracle/agents';

/**
 * Email transport abstraction (re-export from agents).
 */
export type IEmailTransport = IAgentsEmailTransport;

/**
 * Digest insight generation (optional AI enhancement).
 */
export interface IDigestInsightService {
  generateInsight(
    items: readonly IEmailDigestPendingItem[],
    studentName?: string
  ): Promise<string | undefined>;
}

/**
 * Digest sender — sends pending digest for one user.
 */
export interface IDigestSender {
  sendDigestForUser(
    userId: string,
    itemFilter?: (item: IEmailDigestPendingItem) => boolean
  ): Promise<void>;
}

/**
 * Sync trigger — enqueue sync jobs for a student.
 */
export interface ISyncTrigger {
  triggerAllForStudent(studentId: string): Promise<{ jobIds: string[] }>;
}

/**
 * Sync status poller — check if sync jobs have completed.
 */
export interface ISyncStatusPoller {
  getRuns(
    studentId: string,
    limit: number
  ): Promise<ReadonlyArray<{ status: string; createdAt: string }>>;
}

/**
 * Student recipient resolver — find users who receive alerts for a student.
 */
export interface IStudentRecipientResolver {
  resolveRecipients(studentId: string): Promise<string[]>;
}
