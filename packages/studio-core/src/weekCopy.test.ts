/**
 * R2 — shared This-week copy: needs glyphs, status labels, summary line,
 * need-help outcome copy, note helpers (UTF-16 units), deterministic dates.
 */

import {
  WEEK_NEED_GLYPHS,
  STUDENT_STATUS_LABELS,
  STUDENT_STATUS_MARKS,
  STUDENT_STATUS_OPTIONS,
  NEED_HELP_SENT_MESSAGE,
  NEED_HELP_ALREADY_ASKED_MESSAGE,
  NEED_HELP_SAVED_MESSAGE,
  STATUS_SAVE_ERROR,
  WEEK_EMPTY_MESSAGE,
  clampNote,
  doneSectionTitle,
  formatDueDay,
  isWeekClear,
  needGlyphs,
  needHelpOutcomeMessage,
  needHelpPrompt,
  normalizeNote,
  noteCounter,
  resolvedTimeZone,
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

  it('labels, marks and options cover every student status in order', () => {
    expect(STUDENT_STATUS_LABELS).toEqual({
      not_started: 'Not started',
      working_on_it: 'Working on it',
      need_help: 'Need help',
      done: 'Done',
    });
    expect(Object.keys(STUDENT_STATUS_MARKS).sort()).toEqual(
      Object.keys(STUDENT_STATUS_LABELS).sort()
    );
    expect(STUDENT_STATUS_OPTIONS.map((o) => `${o.mark} ${o.label}`)).toEqual([
      '○ Not started',
      '◐ Working on it',
      '⚠ Need help',
      '✓ Done',
    ]);
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

  it('done title carries the count', () => {
    expect(doneSectionTitle(4)).toBe('Done this week (4)');
  });

  describe('need help outcome', () => {
    it('says the grown-ups were told only when the server says notified: true', () => {
      expect(needHelpOutcomeMessage({ notified: true })).toBe(NEED_HELP_SENT_MESSAGE);
      expect(NEED_HELP_SENT_MESSAGE).toBe('Your grown-ups were told');
    });

    it('says they already know when rate-limited (notified: false)', () => {
      expect(
        needHelpOutcomeMessage({ notified: false, nextAllowedAt: '2026-11-10T18:00:00.000Z' })
      ).toBe(NEED_HELP_ALREADY_ASKED_MESSAGE);
      expect(needHelpOutcomeMessage({ notified: false })).toBe(NEED_HELP_ALREADY_ASKED_MESSAGE);
      expect(NEED_HELP_ALREADY_ASKED_MESSAGE).toBe('You already asked today. Your grown-ups know.');
    });

    it('only claims a save when an older server never says notified', () => {
      expect(needHelpOutcomeMessage({})).toBe(NEED_HELP_SAVED_MESSAGE);
      expect(needHelpOutcomeMessage(undefined)).toBe(NEED_HELP_SAVED_MESSAGE);
      expect(NEED_HELP_SAVED_MESSAGE).toBe('Saved. Your grown-ups will see this on your list.');
    });

    it('prompt and error copy follow the spec sketch', () => {
      expect(needHelpPrompt('Ch. 5 problems')).toBe(
        'Tell your grown-ups you\'re stuck on "Ch. 5 problems".'
      );
      expect(STATUS_SAVE_ERROR).toBe("Couldn't save that. Try again.");
    });
  });

  describe('note helpers count UTF-16 code units, like a textarea maxLength', () => {
    it('clamps and counts by .length', () => {
      expect(clampNote('x'.repeat(200))).toHaveLength(140);
      expect(noteCounter('')).toBe('0/140');
      expect(noteCounter("I don't get #7")).toBe('14/140');
      expect(noteCounter('x'.repeat(200))).toBe('200/140');
    });

    it('an emoji counts as two, so 70 emoji fill the note and the 71st is cut', () => {
      const seventy = '😀'.repeat(70);
      expect(noteCounter(seventy)).toBe('140/140');
      expect(clampNote(`${seventy}😀`)).toBe(seventy);
      expect(clampNote(`${seventy}😀`).length).toBe(140);
      expect(noteCounter('😀😀')).toBe('4/140');
    });

    it('normalizes for the wire: trimmed, clamped, blank → undefined', () => {
      expect(normalizeNote('')).toBeUndefined();
      expect(normalizeNote('   ')).toBeUndefined();
      expect(normalizeNote("  I don't get #7  ")).toBe("I don't get #7");
      expect(normalizeNote('y'.repeat(150))).toHaveLength(140);
    });
  });

  describe('formatDueDay is deterministic: en-US, explicit zone', () => {
    const lateEvening = '2026-11-04T05:59:00.000Z'; // 11:59 pm Nov 3 in Chicago

    it('renders the same text on any machine for a given zone', () => {
      expect(formatDueDay(lateEvening, 'UTC')).toBe('Nov 4');
      expect(formatDueDay(lateEvening, 'America/Chicago')).toBe('Nov 3');
      expect(formatDueDay('2026-01-09T12:00:00.000Z', 'Asia/Tokyo')).toBe('Jan 9');
    });

    it('falls back to UTC for an unknown zone and null for bad input', () => {
      expect(formatDueDay(lateEvening, 'Not/AZone')).toBe('Nov 4');
      expect(formatDueDay(undefined, 'UTC')).toBeNull();
      expect(formatDueDay('', 'UTC')).toBeNull();
      expect(formatDueDay('yesterday', 'UTC')).toBeNull();
    });

    it('resolvedTimeZone always answers with a zone', () => {
      expect(typeof resolvedTimeZone()).toBe('string');
      expect(resolvedTimeZone().length).toBeGreaterThan(0);
    });
  });
});
