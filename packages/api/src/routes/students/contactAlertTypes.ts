/**
 * `alertTypes` on a contact row or the owner's prefs is a patch field with three meanings:
 * absent = unchanged, an array = exactly these types, `null` = every type (clears a narrowed
 * list). Without `null` a client could narrow the list but never widen it back, because the
 * routes are PUT-as-patch and an absent key means "leave it".
 */

/** `undefined` = leave as is; `null` = clear; array = set (non-string entries dropped). */
export function parseAlertTypesPatch(raw: unknown): readonly string[] | null | undefined {
  if (raw === null) return null;
  if (!Array.isArray(raw)) return undefined;
  return raw.filter((t): t is string => typeof t === 'string' && t.trim() !== '');
}

/**
 * Applies the patch to a row. A cleared list removes the key outright (never writes `null` or
 * `undefined` into Mongo, which the driver would store as null) so the model's "absent = all"
 * reading holds.
 */
export function withAlertTypes<T extends { readonly alertTypes?: readonly string[] }>(
  row: T,
  patch: readonly string[] | null | undefined
): T {
  if (patch === undefined) return row;
  if (patch === null) {
    const copy: Record<string, unknown> = { ...row };
    delete copy['alertTypes'];
    return copy as T;
  }
  return { ...row, alertTypes: patch };
}
