/**
 * Test data constants for E2E tests.
 */

export type UserRole = 'parent' | 'admin' | 'newUser';

export const TEST_USERS = {
  parent: {
    email: 'test.parent@example.com',
    password: 'TestPass123!',
    name: 'Test Parent',
    role: 'parent' as const,
  },
  admin: {
    email: 'admin@scholarmancy.com',
    password: 'Admin123!',
    name: 'Admin User',
    role: 'admin' as const,
  },
  newUser: {
    email: `new.user.${Date.now()}@example.com`,
    password: 'NewUserPass123!',
    name: 'New User',
    role: 'parent' as const,
  },
} as const;

export const TEST_STUDENTS = [
  {
    name: 'Student One',
    grade: '9',
    school: 'Test High School',
    gpa: 3.5,
  },
  {
    name: 'Student Two',
    grade: '11',
    school: 'Test High School',
    gpa: 3.8,
  },
] as const;

export const TEST_ALERTS = [
  {
    type: 'MISSING_ASSIGNMENT',
    severity: 'warning',
    message: 'Math homework due tomorrow',
  },
  {
    type: 'GRADE_DROP',
    severity: 'critical',
    message: 'Science grade dropped 10%',
  },
] as const;

export const TEST_SETTINGS = {
  notifications: {
    push: true,
    email: true,
    sms: false,
  },
  alerts: {
    gradeDrop: 5,
    daysBeforeDeadline: 2,
    lowGradeThreshold: 80,
  },
} as const;

/**
 * Generate a unique email for test isolation.
 */
export function generateUniqueEmail(prefix: string = 'test'): string {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).substring(7)}@example.com`;
}


