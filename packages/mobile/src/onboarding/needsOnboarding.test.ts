import { needsOnboarding } from './needsOnboarding';

describe('needsOnboarding', () => {
  it('is true when the parent is signed out', () => {
    expect(needsOnboarding({ isLoggedIn: false, studentCount: 0 })).toBe(true);
  });

  it('is true when signed in with no students yet', () => {
    expect(needsOnboarding({ isLoggedIn: true, studentCount: 0 })).toBe(true);
  });

  it('is false when the household already has a student', () => {
    expect(needsOnboarding({ isLoggedIn: true, studentCount: 2 })).toBe(false);
  });
});
