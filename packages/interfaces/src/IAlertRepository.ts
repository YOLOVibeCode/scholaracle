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
 * Reader interface for Alert query operations.
 * Part of ISP split - contains only read/query methods.
 */
export interface IAlertReader {
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
}

/**
 * Writer interface for Alert mutation operations.
 * Part of ISP split - contains only write/mutation methods.
 */
export interface IAlertWriter {
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

/**
 * Combined repository interface for Alert persistence operations.
 * Extends both reader and writer interfaces for backwards compatibility.
 * Uses string IDs to avoid coupling to MongoDB implementation details.
 */
export interface IAlertRepository extends IAlertReader, IAlertWriter {}
