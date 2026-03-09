#!/usr/bin/env node
const { MongoClient, ObjectId } = require('mongodb');

const USER_ID = '69a4f0c73671c632ca591c7c';
const RECENT_JOB_ID = '69aef5b436ec637c5a5ab31c';

async function investigate() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db();
    
    console.log('🔍 COMPREHENSIVE EMAIL INVESTIGATION\n');
    console.log('='.repeat(60));
    
    // 1. Check the specific job
    console.log('\n1️⃣  LATEST JOB STATUS:');
    const job = await db.collection('jobs').findOne({ _id: new ObjectId(RECENT_JOB_ID) });
    if (job) {
      console.log('   ID:', job._id.toString());
      console.log('   Type:', job.type);
      console.log('   Status:', job.status);
      console.log('   Created:', job.createdAt);
      console.log('   Attempts:', job.attempts || 0);
      if (job.lastAttemptAt) console.log('   Last Attempt:', job.lastAttemptAt);
      if (job.completedAt) console.log('   Completed:', job.completedAt);
      if (job.error) console.log('   ❌ Error:', job.error);
      if (job.data) console.log('   Data:', JSON.stringify(job.data));
    } else {
      console.log('   ❌ Job not found');
    }
    
    // 2. Check ALL flush jobs
    console.log('\n2️⃣  ALL FLUSH JOBS (last 5):');
    const allJobs = await db.collection('jobs')
      .find({ type: 'flush_email_digests' })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();
    allJobs.forEach((j, i) => {
      console.log(`\n   Job ${i + 1}:`);
      console.log('   ID:', j._id.toString().substring(0, 12) + '...');
      console.log('   Status:', j.status);
      console.log('   Immediate:', j.data?.immediate || false);
      console.log('   Created:', j.createdAt);
    });
    
    // 3. Check pending digest items
    console.log('\n3️⃣  PENDING DIGEST ITEMS:');
    const pending = await db.collection('email_digest_pending')
      .find({ userId: USER_ID })
      .toArray();
    console.log('   Count:', pending.length);
    if (pending.length > 0) {
      pending.forEach((item, i) => {
        console.log(`\n   Item ${i + 1}:`);
        console.log('   Recipient:', item.recipientEmail);
        console.log('   Student:', item.studentName);
        console.log('   Created:', item.createdAt);
      });
    }
    
    // 4. Check alerts
    console.log('\n4️⃣  RECENT ALERTS:');
    const alerts = await db.collection('slc_alerts')
      .find({ userId: new ObjectId(USER_ID) })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();
    console.log('   Count:', alerts.length);
    alerts.forEach((alert, i) => {
      console.log(`\n   Alert ${i + 1}:`);
      console.log('   Type:', alert.type);
      console.log('   Title:', alert.title);
      console.log('   Created:', alert.createdAt);
    });
    
    // 5. Check communication logs
    console.log('\n5️⃣  RECENT EMAIL COMMUNICATION LOGS:');
    const logs = await db.collection('slc_communication_log')
      .find({ 
        userId: new ObjectId(USER_ID),
        channel: 'email'
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
    console.log('   Count:', logs.length);
    logs.forEach((log, i) => {
      console.log(`\n   Log ${i + 1}:`);
      console.log('   To:', log.recipientEmail);
      console.log('   Subject:', log.subject);
      console.log('   Status:', log.status);
      console.log('   Created:', log.createdAt || log.sentAt || log.failedAt);
      if (log.failureReason) console.log('   ❌ Reason:', log.failureReason);
    });
    
    console.log('\n' + '='.repeat(60));
    await client.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

investigate();
