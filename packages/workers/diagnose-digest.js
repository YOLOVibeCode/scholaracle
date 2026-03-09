#!/usr/bin/env node
/**
 * Check what data exists for Ava and create a proper comprehensive digest
 */
const { MongoClient, ObjectId } = require('mongodb');

const USER_ID = '69a4f0c73671c632ca591c7c';
const STUDENT_ID = '69a4f1b53671c632ca591c7f';

async function investigateAndFix() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 30000,
  });
  
  try {
    await client.connect();
    const db = client.db();
    
    console.log('🔍 Investigating Ava\'s data...\n');
    
    // Check grade snapshots
    console.log('1️⃣ Checking grade snapshots...');
    const snapshots = await db.collection('slc_grade_snapshots')
      .find({ userId: USER_ID })
      .toArray();
    console.log(`   Found ${snapshots.length} grade snapshots`);
    if (snapshots.length > 0) {
      console.log('   Sample:', {
        course: snapshots[0].courseExternalId,
        grade: snapshots[0].record?.percentGrade
      });
    }
    
    // Check courses
    console.log('\n2️⃣ Checking courses...');
    const courses = await db.collection('slc_courses')
      .find({ userId: USER_ID })
      .toArray();
    console.log(`   Found ${courses.length} courses`);
    
    // Check current pending items
    console.log('\n3️⃣ Checking current pending digest items...');
    const pending = await db.collection('email_digest_pending')
      .find({ userId: USER_ID })
      .toArray();
    console.log(`   Found ${pending.length} pending items`);
    
    // Check recent alerts
    console.log('\n4️⃣ Checking recent alerts...');
    const alerts = await db.collection('slc_alerts')
      .find({ userId: new ObjectId(USER_ID) })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();
    console.log(`   Found ${alerts.length} total alerts`);
    if (alerts.length > 0) {
      console.log('   Most recent:', alerts[0].title);
    }
    
    console.log('\n📊 DIAGNOSIS:');
    if (snapshots.length === 0) {
      console.log('   ❌ No grade snapshots - grade bar will be empty!');
      console.log('   Solution: Need to sync data from Skyward/Canvas');
    } else {
      console.log('   ✅ Grade snapshots exist');
    }
    
    if (pending.length === 0) {
      console.log('   ✅ No pending items (already flushed)');
    }
    
    console.log('\n💡 RECOMMENDATION:');
    console.log('   The digest template is correct, but we need:');
    console.log('   1. Fresh sync from Skyward to get grade snapshots');
    console.log('   2. Create varied alerts (not just "Grade System Updated")');
    console.log('   3. Then trigger digest again');
    
    await client.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

investigateAndFix();
