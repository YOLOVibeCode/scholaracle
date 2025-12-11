/**
 * Test data constants for E2E tests.
 */

export type UserRole = 'parent' | 'super_admin' | 'admin' | 'support' | 'billing' | 'analyst';

export const TEST_USERS = {
  parent: {
    email: 'test.parent@example.com',
    password: 'TestPass123!',
    name: 'Test Parent',
    role: 'parent' as const,
  },
  super_admin: {
    email: 'super@scholaracle.com',
    password: 'SuperAdmin123!',
    name: 'Super Admin',
    role: 'super_admin' as const,
  },
  admin: {
    email: 'admin@scholaracle.com',
    password: 'Admin123!',
    name: 'Admin User',
    role: 'admin' as const,
  },
  support: {
    email: 'support@scholaracle.com',
    password: 'Support123!',
    name: 'Support User',
    role: 'support' as const,
  },
  billing: {
    email: 'billing@scholaracle.com',
    password: 'Billing123!',
    name: 'Billing User',
    role: 'billing' as const,
  },
  analyst: {
    email: 'analyst@scholaracle.com',
    password: 'Analyst123!',
    name: 'Analyst User',
    role: 'analyst' as const,
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


