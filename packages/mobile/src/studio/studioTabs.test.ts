import {
  ALL_STALE,
  STUDIO_TABS,
  headerTitle,
  markFresh,
  markOtherStale,
  needsLoad,
  otherTab,
} from './studioTabs';

describe('studioTabs — fetch on first show, refetch only what a change made stale', () => {
  it('offers Today then This week', () => {
    expect(STUDIO_TABS.map((t) => `${t.tab}:${t.label}`)).toEqual([
      'today:Today',
      'week:This week',
    ]);
    expect(otherTab('today')).toBe('week');
    expect(otherTab('week')).toBe('today');
    expect(headerTitle('today')).toBe('Today');
    expect(headerTitle('week')).toBe('This week');
  });

  it('each tab loads the first time it is shown and not on the way back', () => {
    let stale = ALL_STALE;
    expect(needsLoad(stale, 'today')).toBe(true);
    stale = markFresh(stale, 'today');
    expect(needsLoad(stale, 'today')).toBe(false);
    expect(needsLoad(stale, 'week')).toBe(true);
    stale = markFresh(stale, 'week');
    expect(needsLoad(stale, 'week')).toBe(false);
    // Switching back to Today does not fetch again.
    expect(needsLoad(stale, 'today')).toBe(false);
  });

  it('a status change marks only the other tab stale', () => {
    const fresh = markFresh(markFresh(ALL_STALE, 'today'), 'week');
    const afterWeekChange = markOtherStale(fresh, 'week');
    expect(afterWeekChange).toEqual({ today: true, week: false });
    const afterTodayChange = markOtherStale(fresh, 'today');
    expect(afterTodayChange).toEqual({ today: false, week: true });
  });

  it('returns the same object when nothing changes, so effects do not re-run', () => {
    const once = markFresh(ALL_STALE, 'today');
    expect(markFresh(once, 'today')).toBe(once);
    expect(markOtherStale(ALL_STALE, 'week')).toBe(ALL_STALE);
  });
});
