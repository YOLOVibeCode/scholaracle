/**
 * Admin Audit Logs API Client (ISP)
 */

import { apiClient, ApiClientError } from '../client';

export interface IAdminAuditLogItem {
  readonly id: string;
  readonly adminUserId: string;
  readonly adminEmail: string;
  readonly action: string;
  readonly severity: string;
  readonly entityType: string;
  readonly entityId?: string;
  readonly reason?: string;
  readonly metadata?: unknown;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly timestamp: string;
}

export interface IAdminAuditLogsResponse {
  readonly success: boolean;
  readonly data?: readonly IAdminAuditLogItem[];
  readonly total?: number;
  readonly page?: number;
  readonly limit?: number;
  readonly totalPages?: number;
  readonly error?: string;
  readonly code?: string;
}

export interface IAuditLogsQuery {
  readonly page?: number;
  readonly limit?: number;
  readonly action?: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly adminEmail?: string;
  readonly severity?: string;
  readonly from?: string;
  readonly to?: string;
}

export const adminAuditLogsApi = {
  async list(query: IAuditLogsQuery = {}): Promise<IAdminAuditLogsResponse> {
    const qs = new URLSearchParams();
    if (query.page) qs.set('page', String(query.page));
    if (query.limit) qs.set('limit', String(query.limit));
    if (query.action) qs.set('action', query.action);
    if (query.entityType) qs.set('entityType', query.entityType);
    if (query.entityId) qs.set('entityId', query.entityId);
    if (query.adminEmail) qs.set('adminEmail', query.adminEmail);
    if (query.severity) qs.set('severity', query.severity);
    if (query.from) qs.set('from', query.from);
    if (query.to) qs.set('to', query.to);

    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    try {
      return await apiClient.get<IAdminAuditLogsResponse>(`/admin/audit-logs${suffix}`, true);
    } catch (error) {
      const e = error as unknown;
      if (e instanceof ApiClientError) return { success: false, error: e.message, code: e.code };
      return { success: false, error: e instanceof Error ? e.message : 'Network error' };
    }
  },

  async exportCsv(
    query: Omit<IAuditLogsQuery, 'page' | 'limit'> = {},
    stepUpToken?: string
  ): Promise<{ success: boolean; data?: string; error?: string; code?: string }> {
    const qs = new URLSearchParams();
    if (query.action) qs.set('action', query.action);
    if (query.entityType) qs.set('entityType', query.entityType);
    if (query.entityId) qs.set('entityId', query.entityId);
    if (query.adminEmail) qs.set('adminEmail', query.adminEmail);
    if (query.severity) qs.set('severity', query.severity);
    if (query.from) qs.set('from', query.from);
    if (query.to) qs.set('to', query.to);

    const base = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:2801/api';
    const url = `${base}/admin/audit-logs/export${qs.toString() ? `?${qs.toString()}` : ''}`;
    const adminToken = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
          ...(stepUpToken ? { 'x-admin-stepup': stepUpToken } : {}),
        },
      });

      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok) {
        // try JSON error
        if (contentType.includes('application/json')) {
          const json = (await res.json()) as { error?: string; code?: string };
          return { success: false, error: json.error ?? `HTTP ${res.status}`, code: json.code };
        }
        return { success: false, error: `HTTP ${res.status}` };
      }

      const text = await res.text();
      return { success: true, data: text };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Network error' };
    }
  },
};
