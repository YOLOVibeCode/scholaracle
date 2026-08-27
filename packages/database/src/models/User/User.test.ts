import { User } from './User';

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
});
