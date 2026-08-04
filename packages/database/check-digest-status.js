#!/usr/bin/env node
const { MongoClient, ObjectId } = require('mongodb');

const JOB_ID = '69acff28ba7ffc4d29944c3b';
const USER_ID = '69a4f0c73671c632ca591c7c';

async function checkDigestStatus() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 30000,
  });

  try {
    await client.connect();
    const db = client.db();

    console.log('📊 Checking digest job status...\n');

    // Check the job
    const job = await db.collection('jobs').findOne({ _id: new ObjectId(JOB_ID) });
    if (job) {
      console.log('✅ Job found:');
      console.log('   Status:', job.status);
      console.log('   Type:', job.type);
      console.log('   Attempts:', job.attempts, '/', job.maxAttempts);
      console.log('   Created:', job.createdAt);
      if (job.completedAt) console.log('   Completed:', job.completedAt);
      if (job.error) console.log('   Error:', job.error);
      console.log();
    } else {
      console.log('❌ Job not found\n');
    }

    // Check for recent alerts
    const alerts = await db.collection('slc_alerts')
      .find({ 
        userId: new ObjectId(USER_ID),
        type: 'manual_digest'
      })
      .sort({ createdAt: -1 })
      .limit(3)
      .toArray();

    if (alerts.length > 0) {
      console.log(`✅ Found ${alerts.length} manual digest alert(s):`);
      alerts.forEach((alert, i) => {
        console.log(`\n   Alert ${i + 1}:`);
        console.log('   Title:', alert.title);
        console.log('   Created:', alert.createdAt);
        console.log('   Student:', alert.studentName);
      });
      console.log();
    } else {
      console.log('❌ No manual digest alerts found\n');
    }

    // Check pending digest items
    const pending = await db.collection('email_digest_pending')
      .find({ userId: USER_ID })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    if (pending.length > 0) {
      console.log(`📧 Found ${pending.length} pending digest item(s):`);
      pending.forEach((item, i) => {
        console.log(`\n   Item ${i + 1}:`);
        console.log('   Recipient:', item.recipientEmail);
        console.log('   Student:', item.studentName);
        console.log('   Created:', item.createdAt);
      });
      console.log();
    } else {
      console.log('✅ No pending digest items (already processed)\n');
    }

    await client.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkDigestStatus();
