/**
 * Create MongoDB indexes for production.
 *
 * Usage:
 *   MONGODB_URI=mongodb+srv://... npx ts-node scripts/create-indexes.ts
 */

import { MongoClient } from 'mongodb';

async function createIndexes(): Promise<void> {
  const uri = process.env['MONGODB_URI'];
  const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle';

  if (!uri) {
    console.error('MONGODB_URI environment variable is required');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  console.log(`Creating indexes on ${dbName}...`);

  // Users
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  console.log('  users.email (unique)');

  // Students
  await db.collection('students').createIndex({ userId: 1 });
  console.log('  students.userId');

  // Admin users
  await db.collection('admin_users').createIndex({ email: 1 }, { unique: true });
  console.log('  admin_users.email (unique)');

  // Audit logs
  await db.collection('audit_logs').createIndex({ adminUserId: 1 });
  await db.collection('audit_logs').createIndex({ createdAt: -1 });
  await db.collection('audit_logs').createIndex({ action: 1, createdAt: -1 });
  console.log('  audit_logs.adminUserId, createdAt, action+createdAt');

  // Subscriptions
  await db.collection('subscriptions').createIndex({ userId: 1 }, { unique: true });
  await db.collection('subscriptions').createIndex({ stripeCustomerId: 1 });
  await db.collection('subscriptions').createIndex({ status: 1 });
  console.log('  subscriptions.userId (unique), stripeCustomerId, status');

  // Payments
  await db.collection('payments').createIndex({ userId: 1 });
  await db.collection('payments').createIndex({ stripeInvoiceId: 1 });
  await db.collection('payments').createIndex({ createdAt: -1 });
  console.log('  payments.userId, stripeInvoiceId, createdAt');

  // Communication logs
  await db.collection('communication_logs').createIndex({ userId: 1, createdAt: -1 });
  await db.collection('communication_logs').createIndex({ channel: 1, status: 1 });
  console.log('  communication_logs.userId+createdAt, channel+status');

  // Communication batches
  await db.collection('communication_batches').createIndex({ status: 1, scheduledAt: 1 });
  console.log('  communication_batches.status+scheduledAt');

  // Alerts
  await db.collection('alerts').createIndex({ userId: 1, createdAt: -1 });
  await db.collection('alerts').createIndex({ studentId: 1 });
  console.log('  alerts.userId+createdAt, studentId');

  // SLC device auth
  await db.collection('slc_device_auth').createIndex({ deviceCode: 1 }, { unique: true });
  await db.collection('slc_device_auth').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  console.log('  slc_device_auth.deviceCode (unique), expiresAt (TTL)');

  // SLC sources
  await db.collection('slc_sources').createIndex({ userId: 1 });
  console.log('  slc_sources.userId');

  // SLC runs
  await db.collection('slc_runs').createIndex({ sourceId: 1, createdAt: -1 });
  console.log('  slc_runs.sourceId+createdAt');

  // Agenda overrides
  await db.collection('agenda_overrides').createIndex({ userId: 1 });
  console.log('  agenda_overrides.userId');

  // Assignments
  await db.collection('assignments').createIndex({ studentId: 1, dueDate: 1 });
  console.log('  assignments.studentId+dueDate');

  // Grades
  await db.collection('grades').createIndex({ studentId: 1 });
  console.log('  grades.studentId');

  // Jobs
  await db.collection('jobs').createIndex({ status: 1, scheduledAt: 1 });
  await db.collection('jobs').createIndex({ type: 1, status: 1 });
  console.log('  jobs.status+scheduledAt, type+status');

  console.log('All indexes created successfully.');
  await client.close();
}

createIndexes().catch((err) => {
  console.error('Failed to create indexes:', err);
  process.exit(1);
});
