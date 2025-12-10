import { NotificationError } from './NotificationError';

describe('NotificationError', () => {
  describe('constructor', () => {
    it('should create error with message and code', () => {
      // Act
      const error = new NotificationError('Test error', 'TEST_CODE');

      // Assert
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('NotificationError');
      expect(error.context).toBeUndefined();
    });

    it('should create error with context', () => {
      // Arrange
      const context = { notificationId: '123', userId: '456' };

      // Act
      const error = new NotificationError('Test error', 'TEST_CODE', context);

      // Assert
      expect(error.context).toEqual(context);
    });

    it('should be instance of Error', () => {
      // Act
      const error = new NotificationError('Test error', 'TEST_CODE');

      // Assert
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(NotificationError);
    });

    it('should have stack trace', () => {
      // Act
      const error = new NotificationError('Test error', 'TEST_CODE');

      // Assert
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('NotificationError');
    });
  });
});
