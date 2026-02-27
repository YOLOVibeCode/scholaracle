/**
 * Unit tests for grade-history query validator (ISP: single responsibility).
 */

import { validateGradeHistoryQuery } from './gradeHistoryQueryValidator';

describe('validateGradeHistoryQuery', () => {
  it('returns valid when no params', () => {
    expect(validateGradeHistoryQuery({})).toEqual({ valid: true });
  });

  it('returns valid when from and to are YYYY-MM-DD and from <= to', () => {
    expect(validateGradeHistoryQuery({ from: '2025-01-01', to: '2025-12-31' })).toEqual({
      valid: true,
    });
    expect(validateGradeHistoryQuery({ from: '2025-06-15', to: '2025-06-15' })).toEqual({
      valid: true,
    });
  });

  it('returns invalid when from is not YYYY-MM-DD', () => {
    const result = validateGradeHistoryQuery({ from: '02-01-2025', to: undefined });
    expect(result.valid).toBe(false);
    expect((result as { error: string }).error).toMatch(/from|YYYY-MM-DD/i);
  });

  it('returns invalid when to is not YYYY-MM-DD', () => {
    const result = validateGradeHistoryQuery({ from: undefined, to: 'invalid' });
    expect(result.valid).toBe(false);
    expect((result as { error: string }).error).toMatch(/to|YYYY-MM-DD/i);
  });

  it('returns invalid when from is after to', () => {
    const result = validateGradeHistoryQuery({ from: '2025-06-01', to: '2025-01-01' });
    expect(result.valid).toBe(false);
    expect((result as { error: string }).error).toMatch(/from|to|before/i);
  });

  it('returns valid when only from is provided', () => {
    expect(validateGradeHistoryQuery({ from: '2025-01-01' })).toEqual({ valid: true });
  });

  it('returns valid when only to is provided', () => {
    expect(validateGradeHistoryQuery({ to: '2025-12-31' })).toEqual({ valid: true });
  });
});
