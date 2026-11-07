/**
 * Shallow-merge portal selector tables (v1). Patch overrides keys only.
 */
export function mergeSelectorRecord<T extends Record<string, string>>(
  base: T,
  patch?: Partial<T>
): T {
  if (patch === undefined) return base;
  return { ...base, ...patch };
}
