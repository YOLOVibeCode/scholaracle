import { parseAlertTypesPatch, withAlertTypes } from './contactAlertTypes';

describe('contact alertTypes patch', () => {
  it('reads absent as unchanged, null as clear, arrays as set', () => {
    expect(parseAlertTypesPatch(undefined)).toBeUndefined();
    expect(parseAlertTypesPatch('grade_drop')).toBeUndefined();
    expect(parseAlertTypesPatch(null)).toBeNull();
    expect(parseAlertTypesPatch(['grade_drop', 7, '', 'deadline'])).toEqual([
      'grade_drop',
      'deadline',
    ]);
    expect(parseAlertTypesPatch([])).toEqual([]);
  });

  it('applies the patch without ever writing a null key', () => {
    const row = { email: 'a@b.c', alertTypes: ['grade_drop'] as readonly string[] };
    expect(withAlertTypes(row, undefined)).toBe(row);
    expect(withAlertTypes(row, ['deadline'])).toEqual({ email: 'a@b.c', alertTypes: ['deadline'] });
    const cleared = withAlertTypes(row, null);
    expect(cleared).toEqual({ email: 'a@b.c' });
    expect('alertTypes' in cleared).toBe(false);
  });
});
