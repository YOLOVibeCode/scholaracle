/**
 * Admin Notes API Client (ISP)
 *
 * Small, focused interface for admin notes operations.
 * Follows Interface Segregation Principle.
 */

import { apiClient } from '../client';

export interface IAdminNote {
  readonly id: string;
  readonly content: string;
  readonly category: 'general' | 'billing' | 'support' | 'technical' | 'compliance';
  readonly isInternal: boolean;
  readonly isPinned: boolean;
  readonly adminUserId: string;
  readonly adminName?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface IAdminNotesResponse {
  readonly success: boolean;
  readonly data?: readonly IAdminNote[];
  readonly error?: string;
}

export interface ICreateNoteRequest {
  readonly content: string;
  readonly category: 'general' | 'billing' | 'support' | 'technical' | 'compliance';
  readonly isInternal?: boolean;
}

export interface IUpdateNoteRequest {
  readonly content: string;
  readonly category?: 'general' | 'billing' | 'support' | 'technical' | 'compliance';
  readonly isInternal?: boolean;
}

/**
 * Admin notes API client.
 */
export const adminNotesApi = {
  /**
   * Get notes for a customer.
   */
  async getByCustomerId(customerId: string): Promise<IAdminNotesResponse> {
    return apiClient.get<IAdminNotesResponse>(`/admin/customers/${customerId}/notes`, true);
  },

  /**
   * Create a note for a customer.
   */
  async create(
    customerId: string,
    note: ICreateNoteRequest
  ): Promise<{ success: boolean; data?: IAdminNote; error?: string }> {
    return apiClient.post<{ success: boolean; data?: IAdminNote; error?: string }>(
      `/admin/customers/${customerId}/notes`,
      note,
      true
    );
  },

  /**
   * Update a note.
   */
  async update(
    noteId: string,
    updates: IUpdateNoteRequest
  ): Promise<{ success: boolean; error?: string }> {
    return apiClient.put<{ success: boolean; error?: string }>(
      `/admin/notes/${noteId}`,
      updates,
      true
    );
  },

  /**
   * Delete a note.
   */
  async delete(noteId: string): Promise<{ success: boolean; error?: string }> {
    return apiClient.delete<{ success: boolean; error?: string }>(
      `/admin/notes/${noteId}`,
      {},
      true
    );
  },

  /**
   * Toggle pin status of a note.
   */
  async togglePin(noteId: string): Promise<{ success: boolean; error?: string }> {
    return apiClient.post<{ success: boolean; error?: string }>(
      `/admin/notes/${noteId}/pin`,
      {},
      true
    );
  },
};
