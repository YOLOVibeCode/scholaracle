import { findStudentByHint } from './narrowStudentExtract';

const students = [{ name: 'Ann Example' }, { name: 'Ben Example' }, { name: 'Annabel Other' }];

describe('findStudentByHint', () => {
  it('matches the full name exactly, ignoring case and spacing', () => {
    expect(findStudentByHint(students, '  ben   EXAMPLE ')).toBe(students[1]);
  });
  it('matches a unique first name or prefix', () => {
    expect(findStudentByHint(students, 'Ben')).toBe(students[1]);
    expect(findStudentByHint(students, 'Annabel')).toBe(students[2]);
    expect(findStudentByHint(students, 'Ann Ex')).toBe(students[0]);
  });
  it('refuses an ambiguous partial match', () => {
    // "Ann" is a prefix of both "Ann" and "Annabel"
    expect(findStudentByHint(students, 'Ann')).toBeUndefined();
  });
  it('refuses a name that matches nobody', () => {
    expect(findStudentByHint(students, 'Carl')).toBeUndefined();
    expect(findStudentByHint(students, '')).toBeUndefined();
  });
});
