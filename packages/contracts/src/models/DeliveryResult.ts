import { NotificationChannel } from '../enums/NotificationChannel';

export interface DeliveryResult {
  readonly success: boolean;
  readonly channel: NotificationChannel;
  readonly messageId?: string;
  readonly error?: string;
  readonly deliveredAt?: Date;
}
