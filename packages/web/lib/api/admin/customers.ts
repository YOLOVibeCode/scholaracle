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
}

export interface ICustomersListResponse {
  readonly success: boolean;
  readonly data: readonly ICustomer[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages?: number;
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
  async update(id: string, updates: { name?: string; phone?: string }): Promise<{ success: boolean }> {
    return apiClient.put<{ success: boolean }>(`/admin/customers/${id}`, updates, true);
  },

  /**
   * Delete customer (super_admin only).
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
};

