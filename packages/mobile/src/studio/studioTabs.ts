/**
 * The two student-mode tabs and when each one needs a fetch. A tab loads the
 * first time it is shown; after a status change the active tab refetches and
 * the other is marked stale, so it refetches when it is next shown — never on
 * every switch.
 */

export type StudioTab = 'today' | 'week';

export const STUDIO_TABS: readonly { readonly tab: StudioTab; readonly label: string }[] = [
  { tab: 'today', label: 'Today' },
  { tab: 'week', label: 'This week' },
];

export type StaleMap = Readonly<Record<StudioTab, boolean>>;

/** Nothing fetched yet. */
export const ALL_STALE: StaleMap = { today: true, week: true };

export function otherTab(tab: StudioTab): StudioTab {
  return tab === 'today' ? 'week' : 'today';
}

export function needsLoad(stale: StaleMap, tab: StudioTab): boolean {
  return stale[tab];
}

export function markFresh(stale: StaleMap, tab: StudioTab): StaleMap {
  return stale[tab] ? { ...stale, [tab]: false } : stale;
}

/** A status change on `tab` makes the other tab's data out of date. */
export function markOtherStale(stale: StaleMap, tab: StudioTab): StaleMap {
  const other = otherTab(tab);
  return stale[other] ? stale : { ...stale, [other]: true };
}

export function headerTitle(tab: StudioTab): string {
  return tab === 'week' ? 'This week' : 'Today';
}
