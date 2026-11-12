/**
 * Due-date ordering shared by Today and This week. No due date (or an
 * unparseable one) sorts last. Ties keep input order (stable sort).
 */

export interface IHasDueAt {
  readonly dueAt?: string;
}

export function dueAtMs(item: IHasDueAt): number {
  if (item.dueAt === undefined || item.dueAt === '') return Number.POSITIVE_INFINITY;
  const ms = Date.parse(item.dueAt);
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

export function compareByDueAsc(a: IHasDueAt, b: IHasDueAt): number {
  return dueAtMs(a) - dueAtMs(b);
}

/** Oldest due first; returns a new array. */
export function sortByDueAsc<T extends IHasDueAt>(items: readonly T[]): T[] {
  return [...items].sort(compareByDueAsc);
}
