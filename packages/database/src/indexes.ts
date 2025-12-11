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

  // Students collection indexes
  const studentsCollection = database.collection('students');
  await studentsCollection.createIndex({ userId: 1 });
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

  // Communication logs collection indexes
  const communicationLogsCollection = database.collection('communication_logs');
  await communicationLogsCollection.createIndex({ userId: 1, createdAt: -1 });
  await communicationLogsCollection.createIndex({ channel: 1, status: 1 });

  // Alerts collection indexes (if not already created)
  const alertsCollection = database.collection('alerts');
  await alertsCollection.createIndex({ userId: 1, createdAt: -1 });
  await alertsCollection.createIndex({ acknowledged: 1 });

  // eslint-disable-next-line no-console
  console.log('Database indexes created successfully');
}
