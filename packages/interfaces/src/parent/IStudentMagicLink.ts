/**
 * Parent-only: issue a one-time iPad login URL + QR for a provisioned student.
 *
 * Not part of studio-core. Studio pages must not import this interface.
 * Do not fold this into IStudentProvisioner.
 */

export interface IStudentMagicLinkIssued {
  readonly loginUrl: string;
  readonly expiresAt: Date;
  readonly qrDataUrl: string;
}

export interface IStudentMagicLink {
  issue(studentId: string): Promise<IStudentMagicLinkIssued>;
}
