import { DeliveryError } from './DeliveryError';
import { NotificationError } from './NotificationError';
import { NotificationChannel } from '../enums/NotificationChannel';

describe('DeliveryError', () => {
  describe('constructor', () => {
    it('should create error with message, channel, and code', () => {
      // Act
      const error = new DeliveryError('Delivery failed', NotificationChannel.EMAIL);

      // Assert
      expect(error.message).toBe('Delivery failed');
      expect(error.channel).toBe(NotificationChannel.EMAIL);
      expect(error.code).toBe('DELIVERY_ERROR');
      expect(error.name).toBe('DeliveryError');
    });

    it('should create error with context', () => {
      // Arrange
      const context = { notificationId: '123', retryCount: 3 };

      // Act
      const error = new DeliveryError('Delivery failed', NotificationChannel.PUSH, context);

      // Assert
      expect(error.context).toEqual(context);
    });

    it('should be instance of NotificationError', () => {
      // Act
      const error = new DeliveryError('Delivery failed', NotificationChannel.SMS);

      // Assert
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(NotificationError);
      expect(error).toBeInstanceOf(DeliveryError);
    });

    it('should work with all notification channels', () => {
      // Act & Assert
      const emailError = new DeliveryError('Email failed', NotificationChannel.EMAIL);
      expect(emailError.channel).toBe(NotificationChannel.EMAIL);

      const pushError = new DeliveryError('Push failed', NotificationChannel.PUSH);
      expect(pushError.channel).toBe(NotificationChannel.PUSH);

      const smsError = new DeliveryError('SMS failed', NotificationChannel.SMS);
      expect(smsError.channel).toBe(NotificationChannel.SMS);

      const inAppError = new DeliveryError('In-app failed', NotificationChannel.IN_APP);
      expect(inAppError.channel).toBe(NotificationChannel.IN_APP);
    });
  });
});
