/**
 * Narrow interface for sending password reset emails (ISP).
 * Implementations may use SendGrid, Resend, or a stub for tests.
 */
export interface IPasswordResetEmailSender {
  sendResetLink(email: string, resetUrl: string): Promise<void>;
}
