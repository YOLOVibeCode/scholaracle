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
  });
});
