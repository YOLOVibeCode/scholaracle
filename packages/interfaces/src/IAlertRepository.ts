/**
 * Alert data structure for repository operations.
 */
export interface IAlertData {
  readonly studentId: string;
  readonly userId: string;
  readonly type: string;
  readonly severity: string;
  readonly message: string;
  readonly relatedData?: Record<string, unknown>;
  readonly acknowledged?: boolean;
  readonly acknowledgedAt?: Date;
  readonly createdAt?: Date;
}

/**
 * Repository interface for Alert persistence operations.
 * Follows Interface Segregation Principle - focused on data access only.
 * Uses string IDs to avoid coupling to MongoDB implementation details.
 */
export interface IAlertRepository {
  /**
   * Find all alerts for a specific user.
   *
   * @param userId - User ID
   * @returns Array of alerts
   */
  findByUserId(userId: string): Promise<readonly IAlertData[]>;

  /**
   * Find alert by ID.
   *
   * @param id - Alert ID (string)
   * @returns Alert or null if not found
   */
  findById(id: string): Promise<IAlertData | null>;

  /**
   * Create a new alert.
   *
   * @param alert - Alert data
   * @returns Created alert with ID
   */
  create(alert: IAlertData): Promise<IAlertData>;

  /**
   * Acknowledge an alert.
   *
   * @param id - Alert ID (string)
   * @returns True if acknowledged, false if not found
   */
  acknowledge(id: string): Promise<boolean>;

  /**
   * Delete an alert.
   *
   * @param id - Alert ID (string)
   * @returns True if deleted, false if not found
   */
  delete(id: string): Promise<boolean>;
}

