import { classifyOpenTask, studioPrimaryCtaLabel, toIsoDate } from './studioTaskClassify';

describe('classifyOpenTask', () => {
  const now = new Date('2026-08-25T12:00:00.000Z');

  it('treats missing and late as missing even when due is in the future', () => {
    const future = new Date('2026-08-29T12:00:00.000Z');
    expect(classifyOpenTask('missing', future, now)).toBe('missing');
    expect(classifyOpenTask('late', future, now)).toBe('missing');
  });

  it('marks incomplete work due within 72h as due_soon', () => {
    const inADay = new Date('2026-08-26T12:00:00.000Z');
    expect(classifyOpenTask('not_started', inADay, now)).toBe('due_soon');
    expect(classifyOpenTask('in_progress', inADay, now)).toBe('due_soon');
  });

  it('ignores closed statuses and work outside the window', () => {
    const inADay = new Date('2026-08-26T12:00:00.000Z');
    expect(classifyOpenTask('submitted', inADay, now)).toBeNull();
    expect(classifyOpenTask('graded', inADay, now)).toBeNull();
    expect(classifyOpenTask('excused', inADay, now)).toBeNull();
    const inAWeek = new Date('2026-09-01T12:00:00.000Z');
    expect(classifyOpenTask('not_started', inAWeek, now)).toBeNull();
    expect(classifyOpenTask('not_started', undefined, now)).toBeNull();
  });

  it('marks incomplete work due after 72h but inside the next 7 days as upcoming', () => {
    const justPastDueSoon = new Date('2026-08-28T12:00:00.001Z');
    expect(classifyOpenTask('not_started', justPastDueSoon, now)).toBe('upcoming');
    const inFiveDays = new Date('2026-08-30T12:00:00.000Z');
    expect(classifyOpenTask('not_started', inFiveDays, now)).toBe('upcoming');
    expect(classifyOpenTask('in_progress', inFiveDays, now)).toBe('upcoming');
    const lastInstantOfWeek = new Date('2026-09-01T11:59:59.999Z');
    expect(classifyOpenTask('unknown', lastInstantOfWeek, now)).toBe('upcoming');
  });

  it('upcoming never overrides missing, closed, or due-soon', () => {
    const inFiveDays = new Date('2026-08-30T12:00:00.000Z');
    expect(classifyOpenTask('missing', inFiveDays, now)).toBe('missing');
    expect(classifyOpenTask('submitted', inFiveDays, now)).toBeNull();
    const exactlyDueSoonEdge = new Date('2026-08-28T12:00:00.000Z');
    expect(classifyOpenTask('not_started', exactlyDueSoonEdge, now)).toBe('due_soon');
  });
});

describe('studioPrimaryCtaLabel', () => {
  it('names the hosted file kind, else Open assignment', () => {
    expect(studioPrimaryCtaLabel(false, undefined)).toBe('Open assignment');
    expect(studioPrimaryCtaLabel(true, 'application/pdf')).toBe('Open worksheet');
    expect(studioPrimaryCtaLabel(true, undefined)).toBe('Open worksheet');
    expect(studioPrimaryCtaLabel(true, 'video/mp4')).toBe('Open video');
    expect(studioPrimaryCtaLabel(true, 'image/png')).toBe('Open image');
  });
});

describe('toIsoDate', () => {
  it('normalizes Date and ISO strings', () => {
    const d = new Date('2026-08-25T16:00:00.000Z');
    expect(toIsoDate(d)).toBe('2026-08-25T16:00:00.000Z');
    expect(toIsoDate('2026-08-25T16:00:00.000Z')).toBe('2026-08-25T16:00:00.000Z');
    expect(toIsoDate('')).toBeUndefined();
    expect(toIsoDate(new Date('not-a-date'))).toBeUndefined();
  });
});
