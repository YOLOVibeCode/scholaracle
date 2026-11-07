import type { IAccountDeleteRequest, IAccountDeleteResponse } from '@scholaracle/contracts';
import { apiClient } from './client';

export const accountApi = {
  async deleteAccount(password: string): Promise<IAccountDeleteResponse> {
    const body: IAccountDeleteRequest = { password };
    return apiClient.delete<IAccountDeleteResponse>('/account', body);
  },
};
