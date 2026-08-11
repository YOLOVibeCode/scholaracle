/**
 * Registry host matching + publish gate tests (TDD).
 */

import { hostMatches } from './scrapers';

describe('hostMatches', () => {
  it('should match exact hosts', () => {
    expect(hostMatches('school.instructure.com', 'school.instructure.com')).toBe(true);
    expect(hostMatches('school.instructure.com', 'other.instructure.com')).toBe(false);
  });

  it('should match wildcard *.domain', () => {
    expect(hostMatches('*.instructure.com', 'school.instructure.com')).toBe(true);
    expect(hostMatches('*.instructure.com', 'instructure.com')).toBe(true);
    expect(hostMatches('*.instructure.com', 'evil.com')).toBe(false);
  });

  it('should strip URL scheme/path from host input', () => {
    expect(hostMatches('*.instructure.com', 'https://school.instructure.com/login')).toBe(true);
  });
});
