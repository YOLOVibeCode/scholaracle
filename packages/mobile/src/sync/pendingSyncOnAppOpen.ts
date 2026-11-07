import type { IPendingSyncRequestItem } from '@scholaracle/contracts';

export type IPendingSyncFetcher = () => Promise<readonly IPendingSyncRequestItem[]>;

/** Fetches parent pending sync requests when the app opens (client-led sync). */
export async function fetchPendingSyncRequestsOnAppOpen(
  fetcher: IPendingSyncFetcher
): Promise<readonly IPendingSyncRequestItem[]> {
  return fetcher();
}
