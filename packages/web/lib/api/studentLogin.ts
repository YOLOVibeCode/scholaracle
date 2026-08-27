import { apiClient } from './client';
import type {
  IStudentLoginInviteResponse,
  IStudentLoginStatus,
  IStudentMagicLinkResponse,
} from '@scholaracle/contracts';

export type { IStudentLoginInviteResponse, IStudentLoginStatus, IStudentMagicLinkResponse };

export const studentLoginApi = {
  async get(studentId: string): Promise<IStudentLoginStatus> {
    return await apiClient.get<IStudentLoginStatus>(`/students/${studentId}/login`);
  },

  async invite(studentId: string, email?: string): Promise<IStudentLoginInviteResponse> {
    return await apiClient.post<IStudentLoginInviteResponse>(
      `/students/${studentId}/login`,
      email !== undefined ? { email } : {}
    );
  },

  async setShowGrades(studentId: string, showGrades: boolean): Promise<IStudentLoginStatus> {
    return await apiClient.request<IStudentLoginStatus>(`/students/${studentId}/login`, {
      method: 'PATCH',
      body: JSON.stringify({ showGrades }),
    });
  },

  async revoke(studentId: string): Promise<void> {
    await apiClient.delete<{ success?: boolean }>(`/students/${studentId}/login`);
  },

  async issueMagicLink(studentId: string): Promise<IStudentMagicLinkResponse> {
    return await apiClient.post<IStudentMagicLinkResponse>(
      `/students/${studentId}/login/magic-link`,
      {}
    );
  },
};
