/**
 * One-off: For rvegajr@noctusoft.com (Ava Lewis), auto-accept all sharedWith (co-parents),
 * set student alertEmail to 29alewis@ldisd.net, and enqueue 2 test alert jobs.
 * Usage: MONGODB_URI='...' [MONGODB_DB_NAME=scholaracle] node scripts/ava-noctusoft-accept-and-test-alerts.mjs
 */
import { MongoClient, ObjectId } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'scholaracle';

const NOCTUSOFT_EMAIL = 'rvegajr@noctusoft.com';
const AVA_STUDENT_ID = '69a4f1b53671c632ca591c7f';
const AVA_ALERT_EMAIL = '29alewis@ldisd.net';

if (!uri) {
  console.error('Set MONGODB_URI');
  process.exit(1);
}

const client = new MongoClient(uri);
const db = client.db(dbName);
const users = db.collection('users');
const students = db.collection('students');
const jobs = db.collection('jobs');

function now() {
  return new Date();
}

async function main() {
  await client.connect();

  const user = await users.findOne({ email: NOCTUSOFT_EMAIL });
  if (!user) {
    console.error('User not found:', NOCTUSOFT_EMAIL);
    await client.close();
    process.exit(1);
  }

  const studentId = new ObjectId(AVA_STUDENT_ID);
  const student = await students.findOne({ _id: studentId, userId: user._id });
  if (!student) {
    console.error('Student', AVA_STUDENT_ID, 'not found for', NOCTUSOFT_EMAIL);
    await client.close();
    process.exit(1);
  }

  const sharedWith = (student.sharedWith || []).map((sp) => {
    if (sp.status === 'accepted') return sp;
    return {
      ...sp,
      status: 'accepted',
      acceptedAt: now(),
      receiveAlerts: sp.receiveAlerts !== false,
      alertChannels: sp.alertChannels ?? ['email'],
    };
  });

  const updateResult = await students.updateOne(
    { _id: studentId },
    {
      $set: {
        sharedWith,
        alertEmail: AVA_ALERT_EMAIL,
        updatedAt: now(),
      },
    }
  );
  if (updateResult.matchedCount === 0) {
    console.error('Student update failed');
    await client.close();
    process.exit(1);
  }
  console.log('Updated student Ava Lewis: sharedWith accepted (', sharedWith.length, '), alertEmail =', AVA_ALERT_EMAIL);

  const jobPayload = (type, severity, relatedData) => ({
    type: 'notify',
    name: 'deliver-notification',
    data: {
      alert: {
        studentId: AVA_STUDENT_ID,
        type,
        severity,
        relatedData,
      },
    },
    scheduledFor: now(),
    priority: 10,
    status: 'pending',
    attempts: 0,
    maxAttempts: 5,
    createdAt: now(),
    updatedAt: now(),
  });

  const job1 = jobPayload('missing_assignment', 'high', {
    studentName: 'Ava Lewis',
    course: 'Algebra I',
    assignment: 'Homework 5',
    daysAgo: 1,
  });
  const job2 = jobPayload('grade_drop', 'critical', {
    studentName: 'Ava Lewis',
    course: 'English',
    previousGrade: 'B+',
    currentGrade: 'C',
  });

  const insertResult = await jobs.insertMany([job1, job2]);
  const ids = Object.values(insertResult.insertedIds).map((id) => id.toString());
  console.log('Enqueued 2 test alerts. Job IDs:', ids);

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
