import type { Db } from 'mongodb';

/**
 * Create all database indexes.
 *
 * @param database - MongoDB database instance
 */
export async function createIndexes(database: Db): Promise<void> {
  // Users collection indexes
  const usersCollection = database.collection('users');
  await usersCollection.createIndex({ email: 1 }, { unique: true });
  await usersCollection.createIndex({ 'devices.pushToken': 1 });
  // One student login per profile. Devices share that user (sparse: parents have no studentId).
  await usersCollection.createIndex({ studentId: 1 }, { unique: true, sparse: true });

  // Students collection indexes
  const studentsCollection = database.collection('students');
  await studentsCollection.createIndex({ userId: 1 });
  await studentsCollection.createIndex({ userId: 1, studentId: 1 }, { unique: true, sparse: true });
  await studentsCollection.createIndex({ 'dataSources.id': 1 });
  await studentsCollection.createIndex({ 'dataSources.pluginId': 1 });

  // Grades collection indexes (if exists)
  const gradesCollection = database.collection('grades');
  await gradesCollection.createIndex({ studentId: 1 });
  await gradesCollection.createIndex({ courseId: 1 });
  await gradesCollection.createIndex({ scrapedAt: -1 });

  // Assignments collection indexes (if exists)
  const assignmentsCollection = database.collection('assignments');
  await assignmentsCollection.createIndex({ studentId: 1 });
  await assignmentsCollection.createIndex({ dueDate: 1 });
  await assignmentsCollection.createIndex({ status: 1 });
  await assignmentsCollection.createIndex({ scrapedAt: -1 });

  // Jobs collection indexes (for MongoQueue)
  const jobsCollection = database.collection('jobs');
  await jobsCollection.createIndex({ status: 1, priority: -1, scheduledFor: 1 });
  await jobsCollection.createIndex({ scheduledFor: 1 }, { expireAfterSeconds: 0 });
  await jobsCollection.createIndex({ createdAt: 1 });

  // Admin users collection indexes
  const adminUsersCollection = database.collection('admin_users');
  await adminUsersCollection.createIndex({ email: 1 }, { unique: true });
  await adminUsersCollection.createIndex({ role: 1 });
  await adminUsersCollection.createIndex({ isActive: 1 });

  // Audit logs collection indexes
  const auditLogsCollection = database.collection('audit_logs');
  await auditLogsCollection.createIndex({ adminUserId: 1, timestamp: -1 });
  await auditLogsCollection.createIndex({ action: 1, timestamp: -1 });
  await auditLogsCollection.createIndex({ entityType: 1, entityId: 1 });

  // Subscriptions collection indexes
  const subscriptionsCollection = database.collection('subscriptions');
  await subscriptionsCollection.createIndex({ userId: 1 }, { unique: true });
  await subscriptionsCollection.createIndex({ status: 1 });
  await subscriptionsCollection.createIndex({ plan: 1 });
  await subscriptionsCollection.createIndex({ currentPeriodEnd: 1 });

  // Payments collection indexes
  const paymentsCollection = database.collection('payments');
  await paymentsCollection.createIndex({ userId: 1, createdAt: -1 });
  await paymentsCollection.createIndex({ status: 1 });
  await paymentsCollection.createIndex({ stripePaymentIntentId: 1 });
  await paymentsCollection.createIndex({ squarePaymentId: 1 });

  // Communication logs collection indexes
  const communicationLogsCollection = database.collection('communication_logs');
  await communicationLogsCollection.createIndex({ userId: 1, createdAt: -1 });
  await communicationLogsCollection.createIndex({ channel: 1, status: 1 });

  // Alerts collection indexes (if not already created)
  const alertsCollection = database.collection('alerts');
  await alertsCollection.createIndex({ userId: 1, createdAt: -1 });
  await alertsCollection.createIndex({ acknowledged: 1 });

  // SLC (Scholaracle Local Connector) collections
  const slcDeviceAuth = database.collection('slc_device_auth');
  await slcDeviceAuth.createIndex({ deviceCode: 1 }, { unique: true });
  await slcDeviceAuth.createIndex({ userCode: 1 }, { unique: true });
  await slcDeviceAuth.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  const slcSources = database.collection('slc_sources');
  await slcSources.createIndex({ userId: 1, sourceId: 1 }, { unique: true });
  await slcSources.createIndex({ userId: 1, updatedAt: -1 });

  const slcRuns = database.collection('slc_runs');
  await slcRuns.createIndex({ userId: 1, runId: 1 }, { unique: true });
  await slcRuns.createIndex({ userId: 1, sourceId: 1, committedAt: -1 });
  await slcRuns.createIndex({ runId: 1 });

  // Agenda overrides (snooze)
  const agendaOverrides = database.collection('agenda_overrides');
  await agendaOverrides.createIndex(
    { userId: 1, itemType: 1, itemKey: 1, scope: 1 },
    { unique: true }
  );
  await agendaOverrides.createIndex({ userId: 1, snoozedUntil: 1 });

  // Refresh tokens (TTL for automatic cleanup)
  const refreshTokensCollection = database.collection('refresh_tokens');
  await refreshTokensCollection.createIndex({ tokenHash: 1 }, { unique: true });
  await refreshTokensCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await refreshTokensCollection.createIndex({ familyId: 1 });

  // Admin revoked tokens (TTL for automatic cleanup)
  const adminRevokedTokens = database.collection('admin_revoked_tokens');
  await adminRevokedTokens.createIndex({ jti: 1 }, { unique: true });
  await adminRevokedTokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  // Admin MFA pending tokens (TTL for automatic cleanup)
  const adminMFATokens = database.collection('admin_mfa_tokens');
  await adminMFATokens.createIndex({ mfaToken: 1 }, { unique: true });
  await adminMFATokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  // Admin step-up challenges (TTL for automatic cleanup)
  const adminStepUpChallenges = database.collection('admin_step_up_challenges');
  await adminStepUpChallenges.createIndex({ stepUpId: 1 }, { unique: true });
  await adminStepUpChallenges.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  // Admin password reset tokens (TTL for automatic cleanup)
  const adminPasswordResetTokens = database.collection('admin_password_reset_tokens');
  await adminPasswordResetTokens.createIndex({ token: 1 });
  await adminPasswordResetTokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  // Sessions (multi-device session management)
  const sessionsCollection = database.collection('sessions');
  await sessionsCollection.createIndex({ userId: 1, userType: 1 });
  await sessionsCollection.createIndex({ refreshTokenFamilyId: 1 });
  await sessionsCollection.createIndex({ revokedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // 30 days after revoke

  // OAuth accounts (provider + providerAccountId unique)
  const oauthAccountsCollection = database.collection('oauth_accounts');
  await oauthAccountsCollection.createIndex(
    { provider: 1, providerAccountId: 1 },
    { unique: true }
  );
  await oauthAccountsCollection.createIndex({ userId: 1 });

  // SLC entity collection indexes (used by grades endpoint, materials, digest)
  const slcAssignments = database.collection('slc_assignments');
  await slcAssignments.createIndex({
    userId: 1,
    deletedAt: 1,
    studentExternalId: 1,
    institutionExternalId: 1,
  });
  await slcAssignments.createIndex({ userId: 1, deletedAt: 1, studentId: 1 });
  await slcAssignments.createIndex({ userId: 1, courseExternalId: 1 });

  const slcGradeSnapshots = database.collection('slc_grade_snapshots');
  await slcGradeSnapshots.createIndex({
    userId: 1,
    deletedAt: 1,
    studentExternalId: 1,
    institutionExternalId: 1,
  });
  await slcGradeSnapshots.createIndex({ userId: 1, deletedAt: 1, studentId: 1 });

  const slcCourseMaterials = database.collection('slc_course_materials');
  await slcCourseMaterials.createIndex({
    userId: 1,
    deletedAt: 1,
    studentExternalId: 1,
    institutionExternalId: 1,
  });
  await slcCourseMaterials.createIndex({
    userId: 1,
    deletedAt: 1,
    courseExternalId: 1,
    'record.assignmentExternalId': 1,
  });

  const slcCourses = database.collection('slc_courses');
  await slcCourses.createIndex({ userId: 1, externalId: 1 });

  const slcAcademicTerms = database.collection('slc_academic_terms');
  await slcAcademicTerms.createIndex({ userId: 1, deletedAt: 1 });

  const slcGradeHistory = database.collection('slc_grade_history');
  await slcGradeHistory.createIndex({ userId: 1, studentExternalId: 1, date: 1 });
  await slcGradeHistory.createIndex({ userId: 1, courseExternalId: 1, date: 1 });

  const slcAssets = database.collection('slc_assets');
  await slcAssets.createIndex({ userId: 1, entityType: 1, entityExternalId: 1 });
  await slcAssets.createIndex({ userId: 1, sourceId: 1, contentHash: 1 });

  const slcComments = database.collection('slc_assignment_comments');
  await slcComments.createIndex({ userId: 1, assignmentExternalId: 1, deletedAt: 1 });
  await slcComments.createIndex({ authorUserId: 1 });

  const sourceInvites = database.collection('source_invites');
  await sourceInvites.createIndex({ tokenHash: 1 }, { unique: true });
  await sourceInvites.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await sourceInvites.createIndex({
    userId: 1,
    'payload.studentId': 1,
    'payload.provider': 1,
    'payload.institutionExternalId': 1,
    consumedAt: 1,
  });

  const studentMagicTokens = database.collection('student_magic_tokens');
  await studentMagicTokens.createIndex({ tokenHash: 1 }, { unique: true });
  await studentMagicTokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await studentMagicTokens.createIndex({ userId: 1, usedAt: 1 });

  // eslint-disable-next-line no-console
  console.log('Database indexes created successfully');
}
