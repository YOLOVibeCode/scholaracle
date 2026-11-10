import type { IConnectedSource } from '../sources/ConnectedSourceStore';

export function portalAccountGroupKey(source: IConnectedSource): string {
  return source.portalAccountId ?? source.credentialKey;
}

export function groupSourcesByPortalAccount(
  sources: readonly IConnectedSource[]
): ReadonlyMap<string, readonly IConnectedSource[]> {
  const map = new Map<string, IConnectedSource[]>();
  for (const source of sources) {
    const key = portalAccountGroupKey(source);
    const row = map.get(key);
    if (row) {
      row.push(source);
    } else {
      map.set(key, [source]);
    }
  }
  return map;
}

/** Runs sync callbacks one at a time so a shared portal session stays signed in. */
export async function runSerializedSameHostSyncs(
  configs: readonly (() => Promise<void>)[],
  hooks?: { readonly onBetweenRuns?: () => void }
): Promise<void> {
  for (let i = 0; i < configs.length; i++) {
    await configs[i]!();
    if (i < configs.length - 1) {
      hooks?.onBetweenRuns?.();
    }
  }
}
