/**
 * One-off read-only script: find user(s) matching rvegajr (noctusoft/darkware)
 * and list their students (expect Ava) and sharedWith count (expect 2 guests).
 * Usage: MONGODB_URI='...' [MONGODB_DB_NAME=scholaracle] node scripts/check-ava-user.mjs
 */
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'scholaracle';

if (!uri) {
  console.error('Set MONGODB_URI');
  process.exit(1);
}

const client = new MongoClient(uri);
const db = client.db(dbName);
const users = db.collection('users');
const students = db.collection('students');

async function main() {
  await client.connect();

  const searchRegex = { $regex: 'rvegajr', $options: 'i' };
  const found = await users
    .find({ $or: [{ email: searchRegex }, { name: searchRegex }] })
    .toArray();

  if (found.length === 0) {
    console.log('No user found matching "rvegajr" (email or name).');
    await client.close();
    return;
  }

  for (const u of found) {
    const uid = u._id.toString();
    console.log('\n--- User ---');
    console.log('id:', uid);
    console.log('email:', u.email);
    console.log('name:', u.name);

    const studentDocs = await students.find({ userId: u._id }).toArray();
    console.log('students count:', studentDocs.length);

    for (const s of studentDocs) {
      const shared = s.sharedWith || [];
      const accepted = shared.filter((c) => c.status === 'accepted');
      console.log('\n  Student:', s.name, '| id:', s._id?.toString());
      console.log('  sharedWith total:', shared.length, '| accepted:', accepted.length);
      console.log('  alertEmail:', s.alertEmail ?? '(not set)');
    }
  }

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
