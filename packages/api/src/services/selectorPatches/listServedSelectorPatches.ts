import type { Db } from 'mongodb';
import type {
  ISlcServedSelectorPatch,
  IServedSelectorPatchesResponse,
} from '@scholaracle/contracts';
import { ServedSelectorPatchRepository } from '@scholaracle/database';
import { resolveRemoteSelectorPatchesFlags } from '../remoteSelectorPatches/flags';

export async function listServedSelectorPatchesForHost(
  database: Db,
  portalHost: string
): Promise<IServedSelectorPatchesResponse> {
  const flags = resolveRemoteSelectorPatchesFlags();
  if (!flags.remoteSelectorPatches || flags.killSwitch) {
    return { success: true, flags, patches: [] };
  }
  const repo = new ServedSelectorPatchRepository(database);
  const rows = await repo.listServedForPortalHost(portalHost);
  const patches: ISlcServedSelectorPatch[] = rows.map((r) => ({
    patchId: r.patchId,
    portalHost: r.portalHost,
    recipeId: r.recipeId,
    step: r.step,
    selectors: r.selectors,
    status: r.status,
  }));
  return { success: true, flags, patches };
}
