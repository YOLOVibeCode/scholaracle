import { firstNameOf } from './firstName';

describe('firstNameOf', () => {
  it('takes the first token, trimmed', () => {
    expect(firstNameOf('Gideon Vega')).toBe('Gideon');
    expect(firstNameOf('  Ava  Marie Smith ')).toBe('Ava');
    expect(firstNameOf('Cher')).toBe('Cher');
  });

  it('falls back when the name is blank', () => {
    expect(firstNameOf('')).toBe('');
    expect(firstNameOf('   ')).toBe('');
    expect(firstNameOf('', 'Your student')).toBe('Your student');
    expect(firstNameOf('\t', 'there')).toBe('there');
  });
});
