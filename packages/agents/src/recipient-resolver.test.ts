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
    });
    expect(out[1]).toEqual({ parentEmail: 'contact@example.com' });
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
    expect(out[0]).toEqual({ parentEmail: 'owner@example.com', userId: 'owner-user-id' });
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
    expect(out[1]).toEqual({ parentEmail: 'c@x.com', parentPhone: '+1555' });
  });
});
