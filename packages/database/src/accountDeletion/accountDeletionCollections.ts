/**
 * Mongo collections purged when a parent deletes their account.
 * Keep in sync with AccountDeletionService and accountDeletionCollections.test.ts.
 */

export const ACCOUNT_DELETION_AUDIT_COLLECTION = 'account_deletion_audits';

export type UserScopedDeletionTarget = {
  readonly name: string;
  readonly userIdAsObjectId?: boolean;
};

/** Hard-deleted by `{ userId }` (string or ObjectId when userIdAsObjectId). */
export const USER_SCOPED_DELETION_TARGETS: readonly UserScopedDeletionTarget[] = [
  { name: 'slc_assignments' },
  { name: 'slc_courses' },
  { name: 'slc_course_materials' },
  { name: 'slc_grade_snapshots' },
  { name: 'slc_academic_terms' },
  { name: 'slc_grade_history' },
  { name: 'slc_grade_history_archive' },
  { name: 'slc_assets' },
  { name: 'slc_assignment_comments' },
  { name: 'slc_event_series' },
  { name: 'slc_attendance_events' },
  { name: 'slc_activity_log' },
  { name: 'slc_alerts', userIdAsObjectId: true },
  { name: 'slc_communication_log' },
  { name: 'slc_sources', userIdAsObjectId: true },
  { name: 'slc_portal_accounts', userIdAsObjectId: true },
  { name: 'slc_bindings', userIdAsObjectId: true },
  { name: 'slc_runs', userIdAsObjectId: true },
  { name: 'slc_device_auth', userIdAsObjectId: true },
  { name: 'alerts' },
  { name: 'subscriptions' },
  { name: 'payments' },
  { name: 'communication_logs' },
  { name: 'agenda_overrides' },
  { name: 'course_tutorial_overrides', userIdAsObjectId: true },
  { name: 'source_invites' },
  { name: 'student_magic_tokens' },
  { name: 'email_digest_pending' },
  { name: 'sms_digest_pending' },
  { name: 'ai_usage' },
  { name: 'repair_proposals' },
  { name: 'admin_notes' },
  { name: 'oauth_accounts', userIdAsObjectId: true },
  { name: 'sessions', userIdAsObjectId: true },
  { name: 'refresh_tokens', userIdAsObjectId: true },
  { name: 'password_reset_tokens', userIdAsObjectId: true },
  { name: 'email_transfer_confirmations' },
  { name: 'magic_login_tokens', userIdAsObjectId: true },
] as const;

/** Hard-deleted by `{ studentId }` (ObjectId string). */
export const STUDENT_SCOPED_DELETION_COLLECTIONS = [
  'sync_requests',
  'sms_contact_optin_invites',
  'magic_login_tokens',
  'student_help_requests',
  'weekly_review_sends',
] as const;

export const EXTRA_USER_SCOPED_JOB_FILTER = 'jobs';
