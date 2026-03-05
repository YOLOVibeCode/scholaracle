import { resolveAllAlertRecipients } from './recipient-resolver';

let mockStudentInstance: {
  getAllAlertRecipients: (
    ownerEmail: string,
    ownerPhone?: string
  ) => readonly {
    readonly email: string;
    readonly phone?: string;
    readonly channels: readonly ('email' | 'sms')[];
    readonly isPrimary: boolean;
  }[];
  userId: { toString: () => string };
  alertEmail?: string;
} | null;
let mockUserInstance: { email?: string; phone?: string } | null;

jest.mock('@scholaracle/database', () => ({
  StudentRepository: jest.fn().mockImplementation(() => ({
    findById: jest.fn().mockImplementation(() => Promise.resolve(mockStudentInstance)),
  })),
  UserRepository: jest.fn().mockImplementation(() => ({
    findById: jest.fn().mockImplementation(() => Promise.resolve(mockUserInstance)),
  })),
}));

describe('resolveAllAlertRecipients', () => {
  const db = {} as import('mongodb').Db;

  beforeEach(() => {
    mockStudentInstance = null;
    mockUserInstance = null;
  });

  it('should return empty array when student is not found', async () => {
    mockStudentInstance = null;
    const out = await resolveAllAlertRecipients('non-existent-id', db);
    expect(out).toEqual([]);
  });

  it('should return owner and accepted contacts with correct channels', async () => {
    mockUserInstance = { email: 'owner@example.com', phone: '+15551234567' };
    mockStudentInstance = {
      userId: { toString: () => 'owner-user-id' },
      getAllAlertRecipients: (ownerEmail: string, ownerPhone?: string) => [
        {
          email: ownerEmail,
          phone: ownerPhone,
          channels: ['email', 'sms'],
          isPrimary: true,
        },
        {
          email: 'contact@example.com',
          channels: ['email'],
          isPrimary: false,
        },
      ],
    };
    const out = await resolveAllAlertRecipients('student-id', db);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      parentEmail: 'owner@example.com',
      parentPhone: '+15551234567',
      userId: 'owner-user-id',
      recipientType: 'parent',
    });
    expect(out[1]).toEqual({ parentEmail: 'contact@example.com', recipientType: 'parent' });
  });

  it('should exclude recipient with no email or phone', async () => {
    mockUserInstance = { email: 'owner@example.com' };
    mockStudentInstance = {
      userId: { toString: () => 'owner-user-id' },
      getAllAlertRecipients: () => [
        { email: 'owner@example.com', channels: ['email'], isPrimary: true },
        { email: '', phone: undefined, channels: ['sms'], isPrimary: false },
      ],
    };
    const out = await resolveAllAlertRecipients('student-id', db);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      parentEmail: 'owner@example.com',
      userId: 'owner-user-id',
      recipientType: 'parent',
    });
  });

  it('should return only contacts that have at least one channel', async () => {
    mockUserInstance = { email: 'o@x.com' };
    mockStudentInstance = {
      userId: { toString: () => 'uid' },
      getAllAlertRecipients: () => [
        { email: 'o@x.com', channels: ['email'], isPrimary: true },
        { email: 'c@x.com', phone: '+1555', channels: ['email', 'sms'], isPrimary: false },
      ],
    };
    const out = await resolveAllAlertRecipients('student-id', db);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ recipientType: 'parent' });
    expect(out[1]).toEqual({
      parentEmail: 'c@x.com',
      parentPhone: '+1555',
      recipientType: 'parent',
    });
  });

  it('should include student alertEmail when returned by getAllAlertRecipients', async () => {
    mockUserInstance = { email: 'primary@example.com' };
    mockStudentInstance = {
      userId: { toString: () => 'owner-id' },
      alertEmail: '29alewis@ldisd.net',
      getAllAlertRecipients: () => [
        { email: 'primary@example.com', channels: ['email'], isPrimary: true },
        { email: 'secondary1@example.com', channels: ['email'], isPrimary: false },
        { email: 'secondary2@example.com', channels: ['email'], isPrimary: false },
        { email: '29alewis@ldisd.net', channels: ['email'], isPrimary: false },
      ],
    };
    const out = await resolveAllAlertRecipients('student-id', db);
    expect(out).toHaveLength(4);
    expect(out[0]).toMatchObject({
      parentEmail: 'primary@example.com',
      userId: 'owner-id',
      recipientType: 'parent',
    });
    expect(out[1]).toEqual({
      parentEmail: 'secondary1@example.com',
      recipientType: 'parent',
    });
    expect(out[2]).toEqual({
      parentEmail: 'secondary2@example.com',
      recipientType: 'parent',
    });
    expect(out[3]).toEqual({
      parentEmail: '29alewis@ldisd.net',
      recipientType: 'student',
    });
  });

  it('should tag owner and shared contacts as recipientType parent, student email as student', async () => {
    mockUserInstance = { email: 'owner@example.com', phone: '+15550001111' };
    mockStudentInstance = {
      userId: { toString: () => 'user-1' },
      alertEmail: 'student@school.edu',
      getAllAlertRecipients: () => [
        {
          email: 'owner@example.com',
          phone: '+15550001111',
          channels: ['email', 'sms'],
          isPrimary: true,
        },
        { email: 'student@school.edu', channels: ['email'], isPrimary: false },
      ],
    };
    const out = await resolveAllAlertRecipients('student-id', db);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ recipientType: 'parent', parentEmail: 'owner@example.com' });
    expect(out[1]).toMatchObject({ recipientType: 'student', parentEmail: 'student@school.edu' });
  });
});
