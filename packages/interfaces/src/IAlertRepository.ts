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
  /** Legacy, follows the alert's owner (`userId`). Kept one release beside `acknowledgedBy`. */
  readonly acknowledged?: boolean;
  /** Legacy, follows the alert's owner (`userId`). */
  readonly acknowledgedAt?: Date;
  /** Per-person acknowledgement: user id -> ISO date (sharing-spec §4.5). */
  readonly acknowledgedBy?: Readonly<Record<string, string>>;
  readonly createdAt?: Date;
}

/**
 * One student the viewer may see alerts for: its owner (alert rows carry the owner's `userId`)
 * and its Mongo id (what `studentId` holds on every row ingest writes today and the
 * ALERT_STUDENT_ID_MIGRATION rewrote on legacy rows). Rows that still carry an unresolvable
 * portal id are visible to their owner only, through the owner's own `userId`.
 */
export interface IAlertVisibilityScope {
  readonly ownerUserId: string;
  readonly studentId: string;
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
   * Find every alert the viewer may see: rows they own plus rows inside the given scopes.
   *
   * @param viewerUserId - The caller
   * @param scopes - Students the caller can access (owner or accepted adult)
   */
  findVisibleTo(
    viewerUserId: string,
    scopes: readonly IAlertVisibilityScope[]
  ): Promise<readonly IAlertData[]>;

  /**
   * Find the alerts of one student (rows carrying its owner and one of its ids).
   *
   * @param scope - The student's owner and ids
   */
  findByStudentScope(scope: IAlertVisibilityScope): Promise<readonly IAlertData[]>;

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
   * Acknowledge an alert for one person. Writes `acknowledgedBy[userId]`; when that person is
   * the alert's owner the legacy `acknowledged` / `acknowledgedAt` fields are written too.
   *
   * @param id - Alert ID (string)
   * @param userId - The person acknowledging
   * @param ownerUserId - The alert's owner (`userId` on the row)
   * @returns True if acknowledged, false if not found
   */
  acknowledgeFor(id: string, userId: string, ownerUserId: string): Promise<boolean>;

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
