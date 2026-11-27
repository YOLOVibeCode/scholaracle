import { resolveAllAlertRecipients } from './recipient-resolver';

let mockStudentInstance: {
  getAllAlertRecipients: (
    ownerEmail: string,
    ownerPhone?: string
  ) => readonly {
    readonly email: string;
    readonly phone?: string;
    readonly userId?: string;
    readonly channels: readonly ('email' | 'sms' | 'push')[];
    readonly alertTypes?: readonly string[];
    readonly isPrimary: boolean;
  }[];
  userId: { toString: () => string };
  alertEmail?: string;
} | null;
let mockUserInstance: { email?: string; phone?: string } | null;
/** Numbers (E.164) with no consent on record, or with consent withdrawn. Every other number has it. */
let mockNoConsent: Set<string>;
/** What the consent records were asked about. */
let mockConsentAsked: Array<[string, string]>;

jest.mock('@scholaracle/database', () => ({
  StudentRepository: jest.fn().mockImplementation(() => ({
    findById: jest.fn().mockImplementation(() => Promise.resolve(mockStudentInstance)),
  })),
  UserRepository: jest.fn().mockImplementation(() => ({
    findById: jest.fn().mockImplementation(() => Promise.resolve(mockUserInstance)),
  })),
  SmsConsentRepository: jest.fn().mockImplementation(() => ({
    hasActiveConsent: jest.fn().mockImplementation((phone: string, purpose: string) => {
      mockConsentAsked.push([phone, purpose]);
      return Promise.resolve(!mockNoConsent.has(phone));
    }),
  })),
}));

describe('resolveAllAlertRecipients', () => {
  const db = {} as import('mongodb').Db;

  beforeEach(() => {
    mockStudentInstance = null;
    mockUserInstance = null;
    mockNoConsent = new Set();
    mockConsentAsked = [];
  });

  it('should return empty array when student is not found', async () => {
    mockStudentInstance = null;
    const out = await resolveAllAlertRecipients('non-existent-id', db);
    expect(out).toEqual([]);
  });

  it('should return owner and accepted contacts with correct channels', async () => {
    mockUserInstance = { email: 'owner@example.com', phone: '+15125550101' };
    mockStudentInstance = {
      userId: { toString: () => 'owner-user-id' },
      getAllAlertRecipients: (ownerEmail: string, ownerPhone?: string) => [
        {
          email: ownerEmail,
          phone: ownerPhone,
          userId: 'owner-user-id',
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
      parentPhone: '+15125550101',
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
        {
          email: 'owner@example.com',
          userId: 'owner-user-id',
          channels: ['email'],
          isPrimary: true,
        },
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
        { email: 'o@x.com', userId: 'uid', channels: ['email'], isPrimary: true },
        { email: 'c@x.com', phone: '+15125550102', channels: ['email', 'sms'], isPrimary: false },
      ],
    };
    const out = await resolveAllAlertRecipients('student-id', db);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ recipientType: 'parent' });
    expect(out[1]).toEqual({
      parentEmail: 'c@x.com',
      parentPhone: '+15125550102',
      recipientType: 'parent',
    });
  });

  it('should include student alertEmail when returned by getAllAlertRecipients', async () => {
    mockUserInstance = { email: 'primary@example.com' };
    mockStudentInstance = {
      userId: { toString: () => 'owner-id' },
      alertEmail: 'student.one@exampleisd.net',
      getAllAlertRecipients: () => [
        {
          email: 'primary@example.com',
          userId: 'owner-id',
          channels: ['email'],
          isPrimary: true,
        },
        { email: 'secondary1@example.com', channels: ['email'], isPrimary: false },
        { email: 'secondary2@example.com', channels: ['email'], isPrimary: false },
        { email: 'student.one@exampleisd.net', channels: ['email'], isPrimary: false },
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
      parentEmail: 'student.one@exampleisd.net',
      recipientType: 'student',
    });
  });

  it('should tag owner and shared contacts as recipientType parent, student email as student', async () => {
    mockUserInstance = { email: 'owner@example.com', phone: '+15125550103' };
    mockStudentInstance = {
      userId: { toString: () => 'user-1' },
      alertEmail: 'student@school.edu',
      getAllAlertRecipients: () => [
        {
          email: 'owner@example.com',
          phone: '+15125550103',
          userId: 'user-1',
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

  describe('shared adults (sharing-spec §4.5)', () => {
    it('gives every accepted adult their userId and honours mixed channels incl. push', async () => {
      mockUserInstance = { email: 'owner@example.com', phone: '+15125550104' };
      mockStudentInstance = {
        userId: { toString: () => 'owner-id' },
        getAllAlertRecipients: (ownerEmail, ownerPhone) => [
          {
            email: ownerEmail,
            phone: ownerPhone,
            userId: 'owner-id',
            channels: ['email', 'push'],
            isPrimary: true,
          },
          {
            email: 'jess@example.com',
            userId: 'jess-id',
            channels: ['email', 'push'],
            isPrimary: false,
          },
          {
            email: 'tom@example.com',
            phone: '+15125550105',
            userId: 'tom-id',
            channels: ['sms'],
            isPrimary: false,
          },
        ],
      };
      const out = await resolveAllAlertRecipients('student-id', db);
      expect(out).toEqual([
        {
          parentEmail: 'owner@example.com',
          userId: 'owner-id',
          push: true,
          recipientType: 'parent',
        },
        { parentEmail: 'jess@example.com', userId: 'jess-id', push: true, recipientType: 'parent' },
        { parentPhone: '+15125550105', userId: 'tom-id', recipientType: 'parent' },
      ]);
    });

    it('keeps a push-only adult, drops one with no channels, and never pushes without an account', async () => {
      mockUserInstance = { email: 'owner@example.com' };
      mockStudentInstance = {
        userId: { toString: () => 'owner-id' },
        getAllAlertRecipients: () => [
          { email: 'owner@example.com', userId: 'owner-id', channels: ['email'], isPrimary: true },
          { email: 'push-only@example.com', userId: 'po-id', channels: ['push'], isPrimary: false },
          { email: 'silenced@example.com', userId: 'sil-id', channels: [], isPrimary: false },
          { email: 'no-account@example.com', channels: ['push'], isPrimary: false },
        ],
      };
      const out = await resolveAllAlertRecipients('student-id', db);
      expect(out).toEqual([
        { parentEmail: 'owner@example.com', userId: 'owner-id', recipientType: 'parent' },
        { userId: 'po-id', push: true, recipientType: 'parent' },
      ]);
    });

    it('passes a narrowed alertTypes list through and treats an empty list as all', async () => {
      mockUserInstance = { email: 'owner@example.com' };
      mockStudentInstance = {
        userId: { toString: () => 'owner-id' },
        getAllAlertRecipients: () => [
          {
            email: 'owner@example.com',
            userId: 'owner-id',
            channels: ['email'],
            alertTypes: [],
            isPrimary: true,
          },
          {
            email: 'jess@example.com',
            userId: 'jess-id',
            channels: ['email'],
            alertTypes: ['grade_drop', 'missing_assignment'],
            isPrimary: false,
          },
        ],
      };
      const out = await resolveAllAlertRecipients('student-id', db);
      expect(out[0]).not.toHaveProperty('alertTypes');
      expect(out[1]).toMatchObject({ alertTypes: ['grade_drop', 'missing_assignment'] });
    });
  });

  describe('a number is given only when it may be texted', () => {
    type Channel = 'email' | 'sms' | 'push';
    /** A household: the owner with these channels, and one more adult. */
    function household(
      ownerPhone: string | undefined,
      ownerChannels: readonly Channel[],
      other?: { phone?: string; channels: readonly Channel[] }
    ): void {
      mockUserInstance = { email: 'owner@example.com', phone: ownerPhone };
      mockStudentInstance = {
        userId: { toString: () => 'owner-id' },
        getAllAlertRecipients: (ownerEmail, phone) => [
          {
            email: ownerEmail,
            phone,
            userId: 'owner-id',
            channels: ownerChannels,
            isPrimary: true,
          },
          ...(other !== undefined
            ? [
                {
                  email: 'jess@example.com',
                  phone: other.phone,
                  userId: 'jess-id',
                  channels: other.channels,
                  isPrimary: false,
                },
              ]
            : []),
        ],
      };
    }

    it('gives the number as texts are sent to it, and asks about consent for texts from Scholarmancy', async () => {
      household('(512) 555-0106', ['email', 'sms']);

      const out = await resolveAllAlertRecipients('student-id', db);

      expect(out).toEqual([
        {
          parentEmail: 'owner@example.com',
          parentPhone: '+15125550106',
          userId: 'owner-id',
          recipientType: 'parent',
        },
      ]);
      expect(mockConsentAsked).toEqual([
        ['+15125550106', 'grade and assignment alerts and sign-in links'],
      ]);
    });

    it('gives no number that has no consent on record, or whose consent was withdrawn', async () => {
      household('+15125550107', ['email', 'sms'], {
        phone: '+15125550108',
        channels: ['email', 'sms'],
      });
      mockNoConsent.add('+15125550107');

      const out = await resolveAllAlertRecipients('student-id', db);

      // The owner still gets the email; the other adult, who consented, gets both.
      expect(out).toEqual([
        { parentEmail: 'owner@example.com', userId: 'owner-id', recipientType: 'parent' },
        {
          parentEmail: 'jess@example.com',
          parentPhone: '+15125550108',
          userId: 'jess-id',
          recipientType: 'parent',
        },
      ]);
    });

    it('leaves out a person who chose text only and may not be texted', async () => {
      household('+15125550109', ['email'], { phone: '+15125550110', channels: ['sms'] });
      mockNoConsent.add('+15125550110');

      const out = await resolveAllAlertRecipients('student-id', db);

      expect(out).toEqual([
        { parentEmail: 'owner@example.com', userId: 'owner-id', recipientType: 'parent' },
      ]);
    });

    it('gives no number for something that is not a phone number, and none for a blank', async () => {
      household('12345', ['email', 'sms'], { phone: '   ', channels: ['email', 'sms'] });

      const out = await resolveAllAlertRecipients('student-id', db);

      expect(out).toEqual([
        { parentEmail: 'owner@example.com', userId: 'owner-id', recipientType: 'parent' },
        { parentEmail: 'jess@example.com', userId: 'jess-id', recipientType: 'parent' },
      ]);
      expect(mockConsentAsked).toEqual([]);
    });

    it('does not ask about the number of a person who did not choose text', async () => {
      household('+15125550111', ['email', 'push']);

      const out = await resolveAllAlertRecipients('student-id', db);

      expect(out[0]).not.toHaveProperty('parentPhone');
      expect(mockConsentAsked).toEqual([]);
    });
  });
});
