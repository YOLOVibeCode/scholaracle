/**
 * Parent-only write port for student-login provision / revoke / showGrades.
 *
 * Not part of studio-core. Never store passwords in metadata.
 */

export type StudentLoginAuditAction = 'invite' | 'revoke' | 'set_show_grades';

export interface IStudentLoginAuditEvent {
  readonly studentId: string;
  readonly actorUserId: string;
  readonly action: StudentLoginAuditAction;
  readonly at: Date;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface IStudentLoginAudit {
  record(event: IStudentLoginAuditEvent): Promise<void>;
}
