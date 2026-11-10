import { apiClient } from './client';

export async function fetchServerAiConsent(): Promise<boolean> {
  const res = await apiClient.getConsents();
  return res.serverAi;
}

export async function updateServerAiConsent(enabled: boolean): Promise<boolean> {
  const res = await apiClient.setServerAiConsent(enabled);
  return res.serverAi;
}
