import { apiClient } from './client';

export interface IConsentsResponse {
  readonly serverAi: boolean;
}

export const consentsApi = {
  async get(): Promise<IConsentsResponse> {
    return apiClient.get<IConsentsResponse>('/consents');
  },

  async setServerAi(enabled: boolean): Promise<IConsentsResponse> {
    return apiClient.put<IConsentsResponse>('/consents/server-ai', { enabled });
  },
};
