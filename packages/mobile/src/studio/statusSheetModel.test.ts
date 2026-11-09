import {
  NEED_HELP_SENT_MESSAGE,
  NEED_HELP_TITLE,
  STATUS_OPTIONS,
  STATUS_SAVE_ERROR,
  STUDENT_NOTE_MAX_CHARS,
  clampNote,
  isSelected,
  needHelpPrompt,
  normalizeNote,
  noteCounter,
  sheetTitle,
  stepAfterPick,
} from './statusSheetModel';

describe('statusSheetModel', () => {
  it('offers the four statuses in order with labels, marks and test ids', () => {
    expect(STATUS_OPTIONS.map((o) => o.status)).toEqual([
      'not_started',
      'working_on_it',
      'need_help',
      'done',
    ]);
    expect(STATUS_OPTIONS.map((o) => o.label)).toEqual([
      'Not started',
      'Working on it',
      'Need help',
      'Done',
    ]);
    expect(STATUS_OPTIONS.map((o) => o.mark)).toEqual(['○', '◐', '⚠', '✓']);
    expect(STATUS_OPTIONS[2]?.testId).toBe('status-option-need_help');
  });

  it('Need help goes to the note step; every other pick saves straight away', () => {
    expect(stepAfterPick('need_help')).toBe('note');
    expect(stepAfterPick('done')).toBe('pick');
    expect(stepAfterPick('working_on_it')).toBe('pick');
    expect(stepAfterPick('not_started')).toBe('pick');
  });

  it('the note is capped at 140 characters with a live counter', () => {
    expect(STUDENT_NOTE_MAX_CHARS).toBe(140);
    const long = 'x'.repeat(200);
    expect(clampNote(long)).toHaveLength(140);
    expect(noteCounter('')).toBe('0/140');
    expect(noteCounter("I don't get #7")).toBe('14/140');
    expect(noteCounter(long)).toBe('200/140');
    // Emoji count once each, not per UTF-16 unit.
    expect(noteCounter('😀😀')).toBe('2/140');
    expect(clampNote('😀'.repeat(141))).toBe('😀'.repeat(140));
  });

  it('normalizes the note for the wire: trimmed, clamped, blank → undefined', () => {
    expect(normalizeNote('')).toBeUndefined();
    expect(normalizeNote('   ')).toBeUndefined();
    expect(normalizeNote("  I don't get #7  ")).toBe("I don't get #7");
    expect(normalizeNote('y'.repeat(150))).toHaveLength(140);
  });

  it('copy follows the spec sketch', () => {
    expect(NEED_HELP_TITLE).toBe('Need help?');
    expect(needHelpPrompt('Ch. 5 problems')).toBe(
      'Tell your grown-ups you\'re stuck on "Ch. 5 problems".'
    );
    expect(NEED_HELP_SENT_MESSAGE).toBe('Your grown-ups were told');
    expect(STATUS_SAVE_ERROR).toBe("Couldn't save that. Try again.");
    expect(sheetTitle('Essay draft')).toBe('Essay draft');
  });

  it('marks the current status as selected, nothing when unknown (Today rows)', () => {
    const working = STATUS_OPTIONS[1];
    if (working === undefined) throw new Error('missing option');
    expect(isSelected(working, 'working_on_it')).toBe(true);
    expect(isSelected(working, 'done')).toBe(false);
    expect(isSelected(working, undefined)).toBe(false);
  });
});
