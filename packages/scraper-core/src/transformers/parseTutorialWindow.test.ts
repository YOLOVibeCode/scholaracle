import { parseTutorialWindow } from './parseTutorialWindow';

describe('parseTutorialWindow', () => {
  it('should parse tutorial line with days and time', () => {
    expect(parseTutorialWindow('Tutorial: Tue/Thu 7:15–7:45 AM')).toBe('Tue/Thu 7:15–7:45 AM');
  });

  it('should return undefined when tutorial not mentioned', () => {
    expect(parseTutorialWindow('Mon/Wed/Fri 9:00-10:00')).toBeUndefined();
  });

  it('should return undefined for empty input', () => {
    expect(parseTutorialWindow(undefined)).toBeUndefined();
  });
});
