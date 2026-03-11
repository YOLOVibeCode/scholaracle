#!/usr/bin/env node
/**
 * Set user password and send digest email
 * Usage: node set-password-and-send-digest.js
 */

const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'scholaracle';
const USER_EMAIL = 'rvegajr@noctusoft.com';
const NEW_PASSWORD = 'Password1234!';

async function main() {
  console.log('Connecting to MongoDB...');
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB_NAME);

  // Find user
  const usersCollection = db.collection('users');
  const user = await usersCollection.findOne({ email: USER_EMAIL });
  
  if (!user) {
    console.error(`User not found: ${USER_EMAIL}`);
    await client.close();
    process.exit(1);
  }

  console.log(`Found user: ${user.name} (${user.email})`);
  console.log(`User ID: ${user._id}`);

  // Hash password
  const passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);
  
  // Update user password
  const updateResult = await usersCollection.updateOne(
    { _id: user._id },
    { $set: { passwordHash } }
  );

  console.log(`Password updated: ${updateResult.modifiedCount} document(s) modified`);

  // Find Ava's student record
  const studentsCollection = db.collection('students');
  const avaStudent = await studentsCollection.findOne({
    userId: user._id,
    name: 'Ava Lewis'
  });

  if (!avaStudent) {
    console.error('Ava Lewis student record not found');
    await client.close();
    process.exit(1);
  }

  console.log(`\nFound Ava Lewis student record: ${avaStudent._id}`);
  console.log(`Student ID field: ${avaStudent.studentId}`);
  console.log(`Data sources: ${avaStudent.dataSources?.length || 0}`);
  
  if (avaStudent.dataSources) {
    for (const ds of avaStudent.dataSources) {
      console.log(`  - ${ds.provider} (${ds.institutionExternalId || ds.baseUrl})`);
    }
  }

  // Get parent emails
  const parentEmails = (avaStudent.sharedWith || [])
    .filter(p => p.status === 'accepted')
    .map(p => p.email);

  console.log(`\nParents to notify: ${parentEmails.length}`);
  for (const email of parentEmails) {
    console.log(`  - ${email}`);
  }

  await client.close();
  
  console.log('\n✅ Password set successfully!');
  console.log('\nNext: Send digest via API call');
  console.log(`Student ID for digest: ${avaStudent._id}`);
}

main().catch(console.error);
