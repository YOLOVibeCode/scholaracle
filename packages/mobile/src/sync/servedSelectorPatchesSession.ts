import type { ISlcServedSelectorPatch } from '@scholaracle/contracts';

const byHost = new Map<string, readonly ISlcServedSelectorPatch[]>();

export function setServedSelectorPatchesForHost(
  portalHost: string,
  patches: readonly ISlcServedSelectorPatch[]
): void {
  byHost.set(portalHost.toLowerCase(), patches);
}

export function clearServedSelectorPatches(): void {
  byHost.clear();
}

export function pickSelectorPatchForSync(params: {
  readonly portalHost: string;
  readonly recipeId: string;
}): { readonly patchId: string; readonly selectors: Readonly<Record<string, string>> } | null {
  const rows = byHost.get(params.portalHost.toLowerCase()) ?? [];
  const hit = rows.find((p) => p.status === 'served' && p.recipeId === params.recipeId);
  if (!hit) return null;
  return { patchId: hit.patchId, selectors: hit.selectors };
}

export function clearSelectorPatchForHost(portalHost: string): void {
  byHost.delete(portalHost.toLowerCase());
}
