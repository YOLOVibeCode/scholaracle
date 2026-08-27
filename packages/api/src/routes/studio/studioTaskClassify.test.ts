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
