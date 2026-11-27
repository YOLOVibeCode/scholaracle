import { User, accountTextsOn } from './User';

describe('User', () => {
  describe('constructor', () => {
    it('should create user with required fields', () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        name: 'Test User',
      };

      // Act
      const user = new User(userData);

      // Assert
      expect(user.email).toBe('test@example.com');
      expect(user.passwordHash).toBe('hashed-password');
      expect(user.name).toBe('Test User');
      expect(user.phoneVerified).toBe(false);
      expect(user.preferences).toBeDefined();
      expect(user.devices).toEqual([]);
      expect(user.subscription.plan).toBe('free');
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('should use provided preferences', () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        name: 'Test User',
        preferences: {
          notifications: {
            push: false,
            email: true,
            sms: true,
          },
        },
      };

      // Act
      const user = new User(userData);

      // Assert
      expect(user.preferences.notifications.push).toBe(false);
      expect(user.preferences.notifications.email).toBe(true);
      expect(user.preferences.notifications.sms).toBe(true);
    });

    it('should use provided subscription', () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        name: 'Test User',
        subscription: {
          plan: 'premium' as const,
          status: 'active' as const,
        },
      };

      // Act
      const user = new User(userData);

      // Assert
      expect(user.subscription.plan).toBe('premium');
      expect(user.subscription.status).toBe('active');
    });

    it('defaults role to parent when omitted (existing users)', () => {
      const user = new User({
        email: 'legacy@example.com',
        passwordHash: 'hashed-password',
        name: 'Legacy User',
      });

      expect(user.role).toBe('parent');
      expect(user.studentId).toBeUndefined();
    });

    it('stores student role and studentId for a student login', () => {
      const user = new User({
        email: 'emma.demo@scholarmancy.com',
        passwordHash: 'hashed-password',
        name: 'Emma Mitchell',
        role: 'student',
        studentId: '507f1f77bcf86cd799439011',
      });

      expect(user.role).toBe('student');
      expect(user.studentId).toBe('507f1f77bcf86cd799439011');
    });

    it('treats empty studentId as absent', () => {
      const user = new User({
        email: 'parent@example.com',
        passwordHash: 'hashed-password',
        name: 'Parent',
        role: 'parent',
        studentId: '',
      });

      expect(user.studentId).toBeUndefined();
    });
  });

  describe('accountTextsOn', () => {
    const parent = { email: 'parent@example.com', passwordHash: 'hash', name: 'A Parent' };
    const PHONE = '+15125550100';
    const saved = (
      sms: boolean
    ): { notifications: { push: boolean; email: boolean; sms: boolean } } => ({
      notifications: { push: true, email: true, sms },
    });

    it('is on for an account with a number, the opt-in and the text switch', () => {
      const user = new User({
        ...parent,
        phone: PHONE,
        smsConsent: true,
        preferences: saved(true),
      });

      expect(accountTextsOn(user)).toBe(true);
    });

    it('is on for an account that opted in when it registered and never saved settings', () => {
      expect(accountTextsOn(new User({ ...parent, phone: PHONE, smsConsent: true }))).toBe(true);
    });

    it.each([
      ['has no number', { smsConsent: true, preferences: saved(true) }],
      ['has a blank number', { phone: '   ', smsConsent: true, preferences: saved(true) }],
      ['did not opt in', { phone: PHONE, smsConsent: false, preferences: saved(true) }],
      ['turned the text switch off', { phone: PHONE, smsConsent: true, preferences: saved(false) }],
      ['has a number and nothing else', { phone: PHONE }],
    ])('is off for an account that %s', (_what, account) => {
      expect(accountTextsOn(new User({ ...parent, ...account }))).toBe(false);
    });

    it('is off for an account whose saved settings say nothing about texts, as Settings shows it', () => {
      // Settings as an older account stored them: push and email, and no key for texts.
      const withoutSwitch = { notifications: { push: true, email: true } };

      expect(
        accountTextsOn({
          phone: PHONE,
          smsConsent: true,
          preferences: withoutSwitch as User['preferences'],
        })
      ).toBe(false);
    });

    it('is off when there is no account', () => {
      expect(accountTextsOn(null)).toBe(false);
      expect(accountTextsOn(undefined)).toBe(false);
    });
  });

  describe('forcePasswordReset', () => {
    const base = { email: 'invitee@example.com', passwordHash: 'random', name: 'Invitee' };

    it('defaults to false', () => {
      expect(new User(base).forcePasswordReset).toBe(false);
    });

    it('is true only when stored as true', () => {
      expect(new User({ ...base, forcePasswordReset: true }).forcePasswordReset).toBe(true);
      expect(new User({ ...base, forcePasswordReset: false }).forcePasswordReset).toBe(false);
    });
  });
});
