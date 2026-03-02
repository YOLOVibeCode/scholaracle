import { apiClient } from '../client';

export interface ICustomer {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly subscription?: {
    readonly plan: string;
    readonly status: string;
  };
  readonly isSuspended?: boolean;
  readonly createdAt: string;
}

export interface ICustomerDetail extends ICustomer {
  readonly phone?: string;
  readonly phoneVerified?: boolean;
  readonly suspendedReason?: string;
  readonly suspendedAt?: string;
  readonly updatedAt: string;
  readonly subscription?: {
    readonly id?: string;
    readonly plan: string;
    readonly status: string;
  };
}

export interface IAdminCustomerStudent {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly grade?: number;
  readonly studentId?: string;
  readonly stats?: {
    readonly currentGPA?: number;
    readonly missingAssignments?: number;
    readonly totalAssignments?: number;
  };
}

export type AdminCustomerActivityType =
  | 'note'
  | 'payment'
  | 'subscription'
  | 'student'
  | 'admin_action';

export interface IAdminCustomerActivityItem {
  readonly id: string;
  readonly type: AdminCustomerActivityType;
  readonly title: string;
  readonly occurredAt: string; // ISO
  readonly meta?: Record<string, unknown>;
}

export interface ICustomersListResponse {
  readonly success: boolean;
  readonly data: readonly ICustomer[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages?: number;
}

export interface IAdminCustomerStudentsResponse {
  readonly success: boolean;
  readonly data?: readonly IAdminCustomerStudent[];
  readonly error?: string;
}

export interface IAdminCustomerActivityResponse {
  readonly success: boolean;
  readonly data?: readonly IAdminCustomerActivityItem[];
  readonly error?: string;
}

export interface IAdminCustomerLtvResponse {
  readonly success: boolean;
  readonly data?: {
    readonly customerId: string;
    readonly ltv: number;
    readonly currency: string;
  };
  readonly error?: string;
}

/**
 * Admin customers API client.
 */
export const adminCustomersApi = {
  /**
   * Get all customers with pagination and filters.
   */
  async getAll(params?: {
    page?: number;
    limit?: number;
    search?: string;
    plan?: string;
    status?: string;
  }): Promise<ICustomersListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.search) queryParams.set('search', params.search);
    if (params?.plan) queryParams.set('plan', params.plan);
    if (params?.status) queryParams.set('status', params.status);

    const query = queryParams.toString();
    return apiClient.get<ICustomersListResponse>(
      `/admin/customers${query ? `?${query}` : ''}`,
      true
    );
  },

  /**
   * Get customer by ID.
   */
  async getById(id: string): Promise<{ success: boolean; data?: ICustomerDetail; error?: string }> {
    return apiClient.get<{ success: boolean; data?: ICustomerDetail; error?: string }>(
      `/admin/customers/${id}`,
      true
    );
  },

  /**
   * Update customer.
   */
  async update(
    id: string,
    updates: { name?: string; phone?: string }
  ): Promise<{ success: boolean }> {
    return apiClient.put<{ success: boolean }>(`/admin/customers/${id}`, updates, true);
  },

  /**
   * Delete customer (admin only).
   */
  async delete(id: string, reason: string): Promise<{ success: boolean }> {
    return apiClient.delete<{ success: boolean }>(`/admin/customers/${id}`, { reason }, true);
  },

  /**
   * Suspend customer.
   */
  async suspend(id: string, reason: string): Promise<{ success: boolean }> {
    return apiClient.post<{ success: boolean }>(`/admin/customers/${id}/suspend`, { reason }, true);
  },

  /**
   * Unsuspend customer.
   */
  async unsuspend(id: string): Promise<{ success: boolean }> {
    return apiClient.post<{ success: boolean }>(`/admin/customers/${id}/unsuspend`, {}, true);
  },

  /**
   * Get students for a customer.
   */
  async getStudents(id: string): Promise<IAdminCustomerStudentsResponse> {
    return apiClient.get<IAdminCustomerStudentsResponse>(`/admin/customers/${id}/students`, true);
  },

  /**
   * Get recent activity for a customer.
   */
  async getActivity(id: string, limit: number = 50): Promise<IAdminCustomerActivityResponse> {
    return apiClient.get<IAdminCustomerActivityResponse>(
      `/admin/customers/${id}/activity?limit=${limit}`,
      true
    );
  },

  /**
   * Get lifetime value (LTV) for a customer.
   */
  async getLtv(id: string): Promise<IAdminCustomerLtvResponse> {
    return apiClient.get<IAdminCustomerLtvResponse>(`/admin/customers/${id}/ltv`, true);
  },

  /**
   * Impersonate a customer (admin/support only).
   * Returns a *user* JWT token to be stored as the parent session.
   */
  async impersonate(
    id: string,
    reason?: string
  ): Promise<{ success: boolean; data?: { token: string }; error?: string }> {
    return apiClient.post<{ success: boolean; data?: { token: string }; error?: string }>(
      `/admin/customers/${id}/impersonate`,
      { reason },
      true
    );
  },

  /**
   * Set customer password directly (admin only, requires step-up).
   */
  async setPassword(
    id: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    return apiClient.post<{ success: boolean; error?: string }>(
      `/admin/customers/${id}/set-password`,
      { password },
      true
    );
  },

  /**
   * Send password reset email to customer (admin only, requires step-up).
   */
  async sendReset(id: string): Promise<{ success: boolean; error?: string }> {
    return apiClient.post<{ success: boolean; error?: string }>(
      `/admin/customers/${id}/send-reset`,
      {},
      true
    );
  },

  /**
   * Force customer to reset password on next login (admin only, requires step-up).
   */
  async forceReset(id: string): Promise<{ success: boolean; error?: string }> {
    return apiClient.post<{ success: boolean; error?: string }>(
      `/admin/customers/${id}/force-reset`,
      {},
      true
    );
  },
};
