import type { IAlertFilter } from './IAlertFilter';
import type { INotificationGenerator } from './INotificationGenerator';

/**
 * Composition of IAlertFilter + INotificationGenerator.
 * Used by NotificationService to iterate plugin agents; each agent decides if it handles an alert and generates the notification.
 */
export interface INotificationAgent extends IAlertFilter, INotificationGenerator {}
