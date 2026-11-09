/**
 * R2 — shared This-week copy: needs glyphs, status labels, summary line.
 */

import {
  WEEK_NEED_GLYPHS,
  STUDENT_STATUS_LABELS,
  STUDENT_STATUS_MARKS,
  NEED_HELP_SENT_MESSAGE,
  WEEK_EMPTY_MESSAGE,
  doneSectionTitle,
  isWeekClear,
  needGlyphs,
  weekSummaryLine,
} from './weekCopy';

describe('weekCopy', () => {
  it('maps each need to its glyph and short label', () => {
    expect(WEEK_NEED_GLYPHS.saved_file).toEqual({
      need: 'saved_file',
      glyph: '📄',
      label: 'saved',
    });
    expect(WEEK_NEED_GLYPHS.school_login).toEqual({
      need: 'school_login',
      glyph: '🔒',
      label: 'school login',
    });
    expect(WEEK_NEED_GLYPHS.internet).toEqual({
      need: 'internet',
      glyph: '🌐',
      label: 'needs internet',
    });
  });

  it('needGlyphs keeps order and drops repeats', () => {
    expect(needGlyphs(['internet', 'saved_file', 'internet']).map((g) => g.glyph)).toEqual([
      '🌐',
      '📄',
    ]);
    expect(needGlyphs([])).toEqual([]);
  });

  it('labels and marks cover every student status', () => {
    expect(STUDENT_STATUS_LABELS).toEqual({
      not_started: 'Not started',
      working_on_it: 'Working on it',
      need_help: 'Need help',
      done: 'Done',
    });
    expect(Object.keys(STUDENT_STATUS_MARKS).sort()).toEqual(
      Object.keys(STUDENT_STATUS_LABELS).sort()
    );
  });

  it('summary line reads like the weekly review push', () => {
    expect(weekSummaryLine({ owed: 1, due: 3, done: 4 })).toBe(
      '3 due · 1 still owed · you finished 4'
    );
  });

  it('a clear week has nothing owed and nothing due, whatever got done', () => {
    expect(isWeekClear({ owed: 0, due: 0, done: 4 })).toBe(true);
    expect(isWeekClear({ owed: 1, due: 0, done: 0 })).toBe(false);
    expect(isWeekClear({ owed: 0, due: 2, done: 0 })).toBe(false);
    expect(WEEK_EMPTY_MESSAGE).toBe("You're caught up.");
  });

  it('done title carries the count; need-help copy matches the spec', () => {
    expect(doneSectionTitle(4)).toBe('Done this week (4)');
    expect(NEED_HELP_SENT_MESSAGE).toBe('Your grown-ups were told');
  });
});
