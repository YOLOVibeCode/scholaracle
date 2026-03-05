/**
 * One-off migration: move Ava Lewis's secondaryParents into sharedWith and set alertEmail.
 * Run once: MONGODB_URI='...' node packages/api/scripts/migrate-ava-secondary-parents.mjs
 */
import { MongoClient, ObjectId } from 'mongodb';

const AVA_STUDENT_ID = '69a4f1b53671c632ca591c7f';
const AVA_ALERT_EMAIL = '29alewis@ldisd.net';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'scholaracle';

if (!uri) {
  console.error('Set MONGODB_URI');
  process.exit(1);
}

const client = new MongoClient(uri);
const db = client.db(dbName);
const students = db.collection('students');

function toSharedParent(entry) {
  const now = new Date();
  return {
    email: entry.email,
    name: entry.name,
    role: 'parent',
    status: 'accepted',
    invitedAt: now,
    acceptedAt: now,
    receiveAlerts: entry.receiveAlerts !== false,
    alertChannels: entry.alertChannels || ['email'],
  };
}

async function main() {
  await client.connect();

  const student = await students.findOne({ _id: new ObjectId(AVA_STUDENT_ID) });
  if (!student) {
    console.error('Student not found:', AVA_STUDENT_ID);
    await client.close();
    process.exit(1);
  }

  const existingSharedWith = student.sharedWith || [];
  const existingEmails = new Set(existingSharedWith.map((c) => c.email?.toLowerCase()).filter(Boolean));

  let sharedWith = [...existingSharedWith];
  const secondaryParents = student.secondaryParents || [];
  for (const p of secondaryParents) {
    const email = (p.email || '').trim().toLowerCase();
    if (!email || existingEmails.has(email)) continue;
    sharedWith.push(toSharedParent(p));
    existingEmails.add(email);
  }

  const update = {
    $set: {
      sharedWith,
      alertEmail: AVA_ALERT_EMAIL,
      updatedAt: new Date(),
    },
  };
  if (secondaryParents.length > 0) {
    update.$unset = { secondaryParents: '' };
  }

  const result = await students.updateOne(
    { _id: new ObjectId(AVA_STUDENT_ID) },
    update
  );

  if (result.matchedCount === 0) {
    console.error('Student not found for update');
    process.exit(1);
  }
  console.log('Updated student', AVA_STUDENT_ID, '| sharedWith:', sharedWith.length, '| alertEmail:', AVA_ALERT_EMAIL);
  if (secondaryParents.length > 0) {
    console.log('Removed secondaryParents (migrated', secondaryParents.length, 'entries)');
  }

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
