import type { IServedSelectorPatchesResponse } from '@scholaracle/contracts';
import {
  clearServedSelectorPatches,
  setServedSelectorPatchesForHost,
} from './servedSelectorPatchesSession';

export type IServedSelectorPatchFetcher = (
  portalHost: string
) => Promise<IServedSelectorPatchesResponse>;

/** Fetches district served selector patches when the app opens (one open cache). */
export async function fetchServedSelectorPatchesOnAppOpen(
  portalHosts: readonly string[],
  fetcher: IServedSelectorPatchFetcher
): Promise<void> {
  clearServedSelectorPatches();
  const unique = [...new Set(portalHosts.map((h) => h.trim().toLowerCase()).filter(Boolean))];
  await Promise.all(
    unique.map(async (host) => {
      try {
        const res = await fetcher(host);
        if (res.flags.killSwitch || !res.flags.remoteSelectorPatches) {
          setServedSelectorPatchesForHost(host, []);
          return;
        }
        setServedSelectorPatchesForHost(host, res.patches);
      } catch {
        setServedSelectorPatchesForHost(host, []);
      }
    })
  );
}
