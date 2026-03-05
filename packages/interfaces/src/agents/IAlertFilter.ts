import type { Alert } from '@scholaracle/contracts';

/**
 * Single concern: determines whether an agent should process a given alert.
 * Segregated from INotificationGenerator so routing logic can be implemented independently.
 */
export interface IAlertFilter {
  /**
   * Returns true if this agent should process this alert.
   *
   * @param alert - The alert to check
   * @returns True if this agent handles this alert type/context
   */
  handles(alert: Alert): boolean;
}
