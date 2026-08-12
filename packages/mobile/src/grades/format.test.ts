/**
 * format helpers — date/points/percent display used across the grades screens.
 */

import { formatDate, formatPercent, formatPoints, statusColor } from './format';

describe('formatDate', () => {
  it('should format a valid ISO date as "Mon D, YYYY"', () => {
    // Midday UTC keeps the local calendar date stable in any test timezone.
    expect(formatDate('2026-03-15T12:00:00Z')).toBe('Mar 15, 2026');
  });

  it('should return the raw string for unparseable input (Invalid Date guard)', () => {
    // new Date('not-a-date') is Invalid Date, which toLocaleDateString would
    // render as the literal string 'Invalid Date' — the guard prevents that.
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });

  it('should return an empty string unchanged', () => {
    expect(formatDate('')).toBe('');
  });
});

describe('statusColor', () => {
  it('should map each known status to its palette color', () => {
    expect(statusColor('missing')).toEqual({ color: '#dc3545' });
    expect(statusColor('late')).toEqual({ color: '#fd7e14' });
    expect(statusColor('graded')).toEqual({ color: '#28a745' });
    expect(statusColor('submitted')).toEqual({ color: '#4361ee' });
  });

  it('should fall back to muted grey for unknown or absent statuses', () => {
    expect(statusColor('unknown')).toEqual({ color: '#6c757d' });
    expect(statusColor(undefined)).toEqual({ color: '#6c757d' });
    expect(statusColor('something-new')).toEqual({ color: '#6c757d' });
  });
});

describe('formatPoints', () => {
  it('should render earned/possible', () => {
    expect(formatPoints(9, 10)).toBe('9/10');
    expect(formatPoints(9.5, 10)).toBe('9.5/10');
    expect(formatPoints(0, 10)).toBe('0/10');
  });

  it('should render a dash for a missing earned value (ungraded but scored out of N)', () => {
    expect(formatPoints(undefined, 10)).toBe('–/10');
  });

  it('should return null when possible is missing or 0', () => {
    expect(formatPoints(9, undefined)).toBeNull();
    expect(formatPoints(9, 0)).toBeNull();
    expect(formatPoints(undefined, undefined)).toBeNull();
    expect(formatPoints(9, Number.NaN)).toBeNull();
  });
});

describe('formatPercent', () => {
  it('should render one-decimal percentages', () => {
    expect(formatPercent(9, 10)).toBe('90.0%');
    expect(formatPercent(47.5, 50)).toBe('95.0%');
    expect(formatPercent(0, 10)).toBe('0.0%');
  });

  it('should round rather than truncate', () => {
    expect(formatPercent(2, 3)).toBe('66.7%');
  });

  it('should return null when earned is missing', () => {
    expect(formatPercent(undefined, 10)).toBeNull();
    expect(formatPercent(Number.NaN, 10)).toBeNull();
  });

  it('should return null when possible is missing or 0', () => {
    expect(formatPercent(9, undefined)).toBeNull();
    expect(formatPercent(9, 0)).toBeNull();
  });
});
