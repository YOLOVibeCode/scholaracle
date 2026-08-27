/**
 * Parent-only: create / reset / revoke a student login.
 *
 * Not part of studio-core. Studio pages must not import this interface.
 */

export interface IStudentInviteResult {
  readonly email: string;
  readonly temporaryPassword: string;
}

export interface IStudentLoginStatus {
  readonly provisioned: boolean;
  readonly email?: string;
  readonly showGrades: boolean;
  readonly createdAt?: Date;
  readonly userId?: string;
}

export interface IStudentProvisioner {
  getStatus(studentId: string): Promise<IStudentLoginStatus>;
  /**
   * Create a student-role user for this profile, or reset the password if one
   * already exists (including a previously revoked login).
   */
  invite(studentId: string, email?: string): Promise<IStudentInviteResult>;
  /** Suspend the student user and unbind them from the profile. */
  revoke(userId: string): Promise<void>;
  setShowGrades(studentId: string, showGrades: boolean): Promise<void>;
}
