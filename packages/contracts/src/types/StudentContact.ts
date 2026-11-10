/**
 * Contact / shared parent shape for API and notification pipeline.
 */

export interface IStudentContact {
  readonly userId?: string;
  readonly email: string;
  readonly name?: string;
  readonly role: 'parent' | 'guardian' | 'caregiver';
  readonly isAdmin?: boolean;
  readonly status: 'pending' | 'accepted' | 'declined';
  readonly invitedAt: Date | string;
  readonly acceptedAt?: Date | string;
  readonly phone?: string;
  readonly receiveAlerts?: boolean;
  readonly alertChannels?: readonly ('email' | 'sms' | 'push')[];
  readonly alertTypes?: readonly string[];
  /** Copy of the student's weekly review to this adult (default off). */
  readonly weeklyReviewCopy?: boolean;
}

/** Resolved alert recipient for notification delivery. */
export interface IAlertRecipientResolved {
  readonly email: string;
  readonly phone?: string;
  readonly name?: string;
  /** Account id; set for the owner and every accepted adult. Push goes to this account's devices. */
  readonly userId?: string;
  readonly channels: readonly ('email' | 'sms' | 'push')[];
  readonly alertTypes?: readonly string[];
  readonly isPrimary: boolean;
}
