const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set');
  process.exit(1);
}

async function triggerDigest() {
  const client = new MongoClient(MONGODB_URI);

  try {
    console.log('🔌 Connecting to MongoDB...');
    await client.connect();
    const db = client.db();
    console.log('✅ Connected\n');

    const student = await db.collection('students').findOne({ name: 'Ava Lewis' });
    if (!student) {
      throw new Error('Student "Ava Lewis" not found');
    }

    const owner = await db.collection('users').findOne({ _id: student.userId });
    if (!owner) {
      throw new Error('Owner not found');
    }

    const recipientEmail = owner.email || 'rvegajr@noctusoft.com';

    console.log('📧 Creating digest notification:');
    console.log(`   Student: ${student.name}`);
    console.log(`   Recipient: ${recipientEmail}\n`);

    const alert = {
      userId: student.userId,
      studentId: student._id,
      studentName: student.name,
      type: 'manual_digest',
      severity: 'info',
      title: 'Grade System Updated - Skyward Now Primary',
      message:
        "Your student's grades now show official Skyward (SIS) grades as the primary grades. Canvas grades remain visible for reference.",
      metadata: {
        manualTrigger: true,
        recipient: recipientEmail,
      },
      createdAt: new Date(),
      read: false,
    };

    const alertResult = await db.collection('slc_alerts').insertOne(alert);
    console.log(`✅ Alert created: ${alertResult.insertedId.toString()}`);

    await db.collection('email_digest_pending').insertOne({
      userId: student.userId.toString(),
      alertId: alertResult.insertedId.toString(),
      studentId: student._id.toString(),
      studentName: student.name,
      recipientEmail: recipientEmail,
      createdAt: new Date(),
    });
    console.log('✅ Added to email_digest_pending');

    const flushJob = {
      type: 'flush_email_digests',
      status: 'pending',
      createdAt: new Date(),
      scheduledFor: new Date(),
      attempts: 0,
      maxAttempts: 3,
      name: `Manual digest - ${student.name} to primary owner`,
      data: {
        userId: student.userId.toString(),
        immediate: true,
      },
    };

    const jobResult = await db.collection('jobs').insertOne(flushJob);
    console.log(`✅ Flush job created: ${jobResult.insertedId.toString()}\n`);

    console.log('📬 DIGEST QUEUED!');
    console.log(`   To: ${recipientEmail}`);
    console.log(`   Subject: Daily Digest for ${student.name}`);
    console.log('   Content: Grade system update notification\n');

    console.log('⏳ Worker should process within 30 seconds...');

    await client.close();
    console.log('✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

triggerDigest();
