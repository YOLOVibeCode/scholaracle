/**
 * Mongo collections purged when a parent deletes their account.
 *
 * Every collection the server names must appear here: in one of the three deletion lists,
 * among the collections the service removes itself, or in
 * `COLLECTIONS_KEPT_ON_ACCOUNT_DELETION` with the reason it stays.
 * `accountDeletionCoverage.test.ts` (API package) reads the source and fails when a
 * collection is in none of them.
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
  { name: 'slc_event_overrides' },
  { name: 'slc_attendance_events' },
  { name: 'slc_institutions' },
  { name: 'slc_teachers' },
  { name: 'slc_messages' },
  { name: 'slc_student_profiles' },
  { name: 'slc_assignment_reconciliation' },
  { name: 'slc_pending_student_reconciliation' },
  { name: 'slc_activity_log' },
  { name: 'slc_alerts', userIdAsObjectId: true },
  { name: 'slc_communication_log' },
  { name: 'slc_sources', userIdAsObjectId: true },
  { name: 'slc_portal_accounts', userIdAsObjectId: true },
  { name: 'slc_bindings', userIdAsObjectId: true },
  { name: 'slc_runs', userIdAsObjectId: true },
  { name: 'slc_run_skeletons', userIdAsObjectId: true },
  { name: 'slc_device_auth', userIdAsObjectId: true },
  // A connector token is honoured only while its device row exists, so removing these rows
  // is also what stops a still-connected laptop or phone from syncing the records back.
  { name: 'slc_devices' },
  { name: 'revoked_connector_tokens' },
  { name: 'scraper_assist_usage' },
  { name: 'scraper_generation_jobs', userIdAsObjectId: true },
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

/** Hard-deleted by `{ studentId }` (the student's Mongo id, as a string or an ObjectId). */
export const STUDENT_SCOPED_DELETION_COLLECTIONS = [
  'sync_requests',
  'sms_contact_optin_invites',
  'magic_login_tokens',
  'student_help_requests',
  'weekly_review_sends',
  // The reminder ladder's record of what it sent, and its two-a-day count.
  'guidance_sends',
  'guidance_student_days',
  'student_login_audit',
  'shared_parent_transfer_confirmations',
  // Written by older versions of the server. Nothing writes them now.
  'grades',
  'assignments',
] as const;

/** Hard-deleted by `{ _id: userId }`: the row's id is the owner's user id. */
export const USER_ID_KEYED_DELETION_COLLECTIONS = ['sync_staleness_alerts'] as const;

export const EXTRA_USER_SCOPED_JOB_FILTER = 'jobs';

/**
 * Removed by AccountDeletionService itself, outside the lists above: the people, the queue
 * (jobs that name the user or one of their students) and the deletion record it writes.
 */
export const COLLECTIONS_HANDLED_BY_DELETION_SERVICE = [
  'users',
  'students',
  EXTRA_USER_SCOPED_JOB_FILTER,
  ACCOUNT_DELETION_AUDIT_COLLECTION,
] as const;

/** Collections account deletion leaves alone, each with the reason. */
export const COLLECTIONS_KEPT_ON_ACCOUNT_DELETION: Readonly<Record<string, string>> = {
  admin_users: 'Staff accounts, not households.',
  admin_mfa_tokens: 'Staff accounts.',
  admin_password_reset_tokens: 'Staff accounts.',
  admin_revoked_tokens: 'Staff accounts.',
  admin_step_up_challenges: 'Staff accounts.',
  audit_logs: 'The record of what staff did. It can name the account a staff member acted on.',
  billing_orphans:
    'Money events that matched no account, kept for the books. A row can hold the buyer email.',
  webhook_events: 'Payment event ids, kept so an event is handled once. No person fields.',
  coupons: 'Coupon definitions. A redemption entry holds a user id and a date.',
  communication_batches:
    'Staff mailings. One sent to named addresses keeps those addresses in its criteria.',
  communication_templates: 'Staff mail templates.',
  consents:
    'Consent to AI processing, by user id. Whether proof of consent outlives the account is a decision for the owner and counsel.',
  sms_consents:
    'Consent to texts and opt-outs, by phone number. Same decision; an opt-out must also keep working.',
  cli_auth_requests: 'Expire on their own within minutes.',
  sharing_rate_limits: 'Counters that expire on their own within a day.',
  one_time_migrations: 'System bookkeeping.',
  worker_heartbeats: 'System bookkeeping.',
  scraper_registry: 'Published scrapers. No household data.',
  scraper_reports: 'Failure reports with no person fields.',
  repair_candidates: 'Page-structure gaps by portal host. No person fields.',
  served_selector_patches: 'Selector fixes by portal host. No person fields.',
  slc_external_id_aliases: 'Adapter name aliases. No person fields.',
  sync_runs: 'Read by one staff page. Nothing writes it.',
};
