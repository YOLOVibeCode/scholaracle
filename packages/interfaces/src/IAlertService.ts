import type { IAlertData } from './IAlertRepository';

/**
 * Service interface for Alert business logic operations.
 * Follows Interface Segregation Principle - focused on business logic only.
 */
export interface IAlertService {
  /**
   * Get all alerts for a user.
   *
   * @param userId - User ID
   * @returns Array of alerts
   */
  getAlertsForUser(userId: string): Promise<readonly IAlertData[]>;

  /**
   * Acknowledge an alert (with authorization check).
   *
   * @param alertId - Alert ID
   * @param userId - User ID (for authorization)
   * @returns True if acknowledged, false if unauthorized or not found
   */
  acknowledgeAlert(alertId: string, userId: string): Promise<boolean>;

  /**
   * Create a new alert.
   *
   * @param data - Alert creation data
   * @returns Created alert
   */
  createAlert(data: ICreateAlertRequest): Promise<IAlertData>;
}

/**
 * Request data for creating an alert.
 */
export interface ICreateAlertRequest {
  readonly studentId: string;
  readonly userId: string;
  readonly type: string;
  readonly severity: string;
  readonly message: string;
  readonly relatedData?: Record<string, unknown>;
}

