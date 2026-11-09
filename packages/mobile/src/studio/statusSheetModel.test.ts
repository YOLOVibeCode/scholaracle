import { STATUS_OPTIONS, canDismiss, isSelected, stepAfterPick } from './statusSheetModel';

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

  it('marks the current status as selected, nothing when unknown (Today rows)', () => {
    const working = STATUS_OPTIONS[1];
    if (working === undefined) throw new Error('missing option');
    expect(isSelected(working, 'working_on_it')).toBe(true);
    expect(isSelected(working, 'done')).toBe(false);
    expect(isSelected(working, undefined)).toBe(false);
  });

  it('cannot be dismissed while a save is in flight', () => {
    expect(canDismiss(true)).toBe(false);
    expect(canDismiss(false)).toBe(true);
  });
});
