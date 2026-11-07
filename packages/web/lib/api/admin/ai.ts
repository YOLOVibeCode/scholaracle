import { apiClient } from '../client';

export interface IAdminAiUsageDistrictRepairCount {
  readonly portalHost: string;
  readonly repairCount: number;
}

export interface IAdminAiUsageSummary {
  readonly monthToDateSpendUsd: number;
  readonly verificationPassRate: number;
  readonly repairsByDistrict: readonly IAdminAiUsageDistrictRepairCount[];
}

export const adminAiApi = {
  async getUsageSummary(): Promise<{ success: boolean; data: IAdminAiUsageSummary }> {
    return apiClient.get<{ success: boolean; data: IAdminAiUsageSummary }>(
      '/admin/ai/usage-summary',
      true
    );
  },
};
