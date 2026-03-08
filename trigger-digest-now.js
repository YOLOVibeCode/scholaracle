const { MongoClient } = require('mongodb');

(async () => {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db();
    
    const student = await db.collection('students').findOne({ name: 'Ava Lewis' });
    if (!student) throw new Error('Student not found');
    
    const owner = await db.collection('users').findOne({ _id: student.userId });
    const recipientEmail = owner?.email || 'rvegajr@noctusoft.com';
    
    console.log('📧 TRIGGERING DIGEST FOR:', recipientEmail);
    
    const alert = {
      userId: student.userId,
      studentId: student._id,
      studentName: student.name,
      type: 'manual_digest',
      severity: 'info',
      title: 'Grade System Updated - Skyward Now Primary',
      message: 'Grades now show official Skyward (SIS) as primary. Canvas grades available for reference.',
      metadata: { manualTrigger: true, recipient: recipientEmail },
      createdAt: new Date(),
      read: false
    };
    
    const alertResult = await db.collection('slc_alerts').insertOne(alert);
    
    await db.collection('email_digest_pending').insertOne({
      userId: student.userId.toString(),
      alertId: alertResult.insertedId.toString(),
      studentId: student._id.toString(),
      studentName: student.name,
      recipientEmail: recipientEmail,
      createdAt: new Date()
    });
    
    const flushJob = {
      type: 'flush_email_digests',
      status: 'pending',
      createdAt: new Date(),
      scheduledFor: new Date(),
      attempts: 0,
      maxAttempts: 3,
      name: 'Manual digest - Ava to primary',
      data: { userId: student.userId.toString(), immediate: true }
    };
    
    await db.collection('jobs').insertOne(flushJob);
    
    console.log('✅ SUCCESS! Email will arrive at:', recipientEmail);
    console.log('Check your inbox in ~30 seconds');
    
    await client.close();
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
