import { formatClassMeetingSummary } from './classMeetingSummary';

describe('formatClassMeetingSummary', () => {
  it('should format period, days, and time range', () => {
    const summary = formatClassMeetingSummary({
      period: '3rd',
      daysOfWeek: [1, 3, 5],
      startTime: '09:15',
      endTime: '10:05',
    });
    expect(summary).toBe('Period 3rd · Mon/Wed/Fri · 09:15–10:05');
  });

  it('should return undefined when no meeting fields', () => {
    expect(formatClassMeetingSummary({})).toBeUndefined();
  });
});
