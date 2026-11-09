import {
  fetchServedSelectorPatchesOnAppOpen,
  type IServedSelectorPatchFetcher,
} from './servedSelectorPatchesOnAppOpen';
import { pickSelectorPatchForSync } from './servedSelectorPatchesSession';

describe('fetchServedSelectorPatchesOnAppOpen', () => {
  it('clears cache when kill switch is on', async () => {
    const fetcher: IServedSelectorPatchFetcher = async () => ({
      success: true,
      flags: { remoteSelectorPatches: true, killSwitch: true },
      patches: [
        {
          patchId: 'p1',
          portalHost: 'district.aeries.net',
          recipeId: 'aeries',
          step: 'aeries.gradebook.assignments',
          selectors: { x: 'y' },
          status: 'served',
        },
      ],
    });
    await fetchServedSelectorPatchesOnAppOpen(['district.aeries.net'], fetcher);
    expect(
      pickSelectorPatchForSync({ portalHost: 'district.aeries.net', recipeId: 'aeries' })
    ).toBeNull();
  });
});
