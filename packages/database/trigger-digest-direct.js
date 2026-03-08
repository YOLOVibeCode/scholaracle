#!/usr/bin/env node
/**
 * Direct database insert for manual digest trigger
 * Bypasses API and inserts records directly into MongoDB
 */
const { MongoClient, ObjectId } = require('mongodb');

const STUDENT_ID = '69a4f1b53671c632ca591c7f';
const USER_ID = '69a4f0c73671c632ca591c7c';
const RECIPIENT_EMAIL = 'rvegajr@noctusoft.com';

async function triggerDigestDirect() {
  // Use internal Railway MongoDB URI
  const uri = process.env.MONGODB_URI || 'mongodb://mongo:***REMOVED***@junction.proxy.rlwy.net:22636';
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 30000,
  });

  try {
    console.log('🔌 Connecting to MongoDB...');
    await client.connect();
    const db = client.db();
    console.log('✅ Connected\n');

    console.log('📧 Creating digest notification for:', RECIPIENT_EMAIL);
    console.log('   Student: Ava Lewis\n');

    // Create alert
    const alert = {
      userId: new ObjectId(USER_ID),
      studentId: new ObjectId(STUDENT_ID),
      studentName: 'Ava Lewis',
      type: 'manual_digest',
      severity: 'info',
      title: 'Grade System Updated - Skyward Now Primary',
      message:
        "Your student's grades now show official Skyward (SIS) grades as the primary grades. Canvas grades remain visible for reference.",
      metadata: {
        manualTrigger: true,
        recipient: RECIPIENT_EMAIL,
      },
      createdAt: new Date(),
      read: false,
    };

    const alertResult = await db.collection('slc_alerts').insertOne(alert);
    console.log(`✅ Alert created: ${alertResult.insertedId.toString().substring(0, 12)}...`);

    // Queue for digest
    await db.collection('email_digest_pending').insertOne({
      userId: USER_ID,
      alertId: alertResult.insertedId.toString(),
      studentId: STUDENT_ID,
      studentName: 'Ava Lewis',
      recipientEmail: RECIPIENT_EMAIL,
      createdAt: new Date(),
    });
    console.log('✅ Added to email_digest_pending');

    // Create immediate flush job
    const flushJob = {
      type: 'flush_email_digests',
      status: 'pending',
      createdAt: new Date(),
      scheduledFor: new Date(),
      attempts: 0,
      maxAttempts: 3,
      name: 'Manual digest - Ava Lewis to primary owner',
      data: {
        userId: USER_ID,
        immediate: true,
      },
    };

    const jobResult = await db.collection('jobs').insertOne(flushJob);
    console.log(`✅ Flush job created: ${jobResult.insertedId.toString().substring(0, 12)}...\n`);

    console.log('📬 DIGEST QUEUED!');
    console.log(`   To: ${RECIPIENT_EMAIL}`);
    console.log('   Subject: Daily Digest for Ava Lewis');
    console.log('   Content: Grade system update notification\n');

    console.log('⏳ Worker will process within 30 seconds...');
    console.log('📧 Check your email inbox!\n');

    await client.close();
    console.log('✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

triggerDigestDirect();
