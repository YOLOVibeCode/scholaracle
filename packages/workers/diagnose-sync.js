#!/usr/bin/env node
/**
 * Diagnostic script to check sync job and run status
 */
const { MongoClient } = require('mongodb');

async function diagnose() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI not set');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db();
    
    console.log('🔍 Sync Diagnostic Report\n');
    console.log('=' .repeat(60));
    
    // Check jobs collection
    console.log('\n1️⃣  JOBS COLLECTION (MongoQueue)');
    console.log('-'.repeat(60));
    const recentJobs = await db.collection('jobs')
      .find({ type: 'sync' })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();
    
    if (recentJobs.length === 0) {
      console.log('❌ No sync jobs found in jobs collection');
      console.log('   This means syncScheduler.triggerNow() is NOT being called');
    } else {
      console.log(`✅ Found ${recentJobs.length} recent sync jobs:`);
      recentJobs.forEach((job, i) => {
        console.log(`\n   Job ${i + 1}:`);
        console.log(`   - ID: ${job._id}`);
        console.log(`   - Name: ${job.name}`);
        console.log(`   - Status: ${job.status}`);
        console.log(`   - Student: ${job.data?.studentId}`);
        console.log(`   - Provider: ${job.data?.provider}`);
        console.log(`   - Created: ${job.createdAt}`);
        console.log(`   - Scheduled For: ${job.scheduledFor}`);
        console.log(`   - Attempts: ${job.attempts || 0}/${job.maxAttempts}`);
        if (job.lockedAt) console.log(`   - Locked At: ${job.lockedAt}`);
        if (job.error) console.log(`   - Error: ${job.error}`);
      });
    }
    
    // Check sync_runs collection
    console.log('\n\n2️⃣  SYNC_RUNS COLLECTION (SyncWorker output)');
    console.log('-'.repeat(60));
    const recentSyncRuns = await db.collection('sync_runs')
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();
    
    if (recentSyncRuns.length === 0) {
      console.log('❌ No sync runs found in sync_runs collection');
      console.log('   This means SyncWorker has never processed any jobs');
    } else {
      console.log(`✅ Found ${recentSyncRuns.length} recent sync runs:`);
      recentSyncRuns.forEach((run, i) => {
        console.log(`\n   Run ${i + 1}:`);
        console.log(`   - ID: ${run._id}`);
        console.log(`   - Job ID: ${run.jobId}`);
        console.log(`   - Status: ${run.status}`);
        console.log(`   - Student: ${run.studentId}`);
        console.log(`   - Provider: ${run.provider}`);
        console.log(`   - Created: ${run.createdAt}`);
        if (run.completedAt) console.log(`   - Completed: ${run.completedAt}`);
        if (run.error) console.log(`   - Error: ${run.error}`);
      });
    }
    
    // Check slc_runs collection (ingest runs from dashboard trigger)
    console.log('\n\n3️⃣  SLC_RUNS COLLECTION (Ingest API runs)');
    console.log('-'.repeat(60));
    const recentSlcRuns = await db.collection('slc_runs')
      .find({})
      .sort({ startedAt: -1 })
      .limit(5)
      .toArray();
    
    if (recentSlcRuns.length === 0) {
      console.log('❌ No runs found in slc_runs collection');
    } else {
      console.log(`✅ Found ${recentSlcRuns.length} recent ingest runs:`);
      recentSlcRuns.forEach((run, i) => {
        console.log(`\n   Run ${i + 1}:`);
        console.log(`   - Run ID: ${run.runId}`);
        console.log(`   - Status: ${run.status}`);
        console.log(`   - Source ID: ${run.sourceId}`);
        console.log(`   - Started: ${run.startedAt}`);
        if (run.committedAt) console.log(`   - Committed: ${run.committedAt}`);
        if (run.error) console.log(`   - Error: ${run.error}`);
      });
    }
    
    // Summary
    console.log('\n\n📊 SUMMARY');
    console.log('='.repeat(60));
    
    const pendingJobs = await db.collection('jobs')
      .countDocuments({ type: 'sync', status: 'pending' });
    const processingJobs = await db.collection('jobs')
      .countDocuments({ type: 'sync', status: 'processing' });
    const completedJobs = await db.collection('jobs')
      .countDocuments({ type: 'sync', status: 'completed' });
    const failedJobs = await db.collection('jobs')
      .countDocuments({ type: 'sync', status: 'failed' });
    
    console.log('\nJobs Status:');
    console.log(`  - Pending: ${pendingJobs}`);
    console.log(`  - Processing: ${processingJobs}`);
    console.log(`  - Completed: ${completedJobs}`);
    console.log(`  - Failed: ${failedJobs}`);
    
    if (pendingJobs > 0 && recentSyncRuns.length === 0) {
      console.log('\n⚠️  ISSUE DETECTED:');
      console.log('   Jobs are pending but SyncWorker has never processed any.');
      console.log('   This means the workers service is not running or not polling.');
    }
    
    if (processingJobs > 0) {
      const stuckJobs = await db.collection('jobs')
        .find({ 
          type: 'sync', 
          status: 'processing',
          lockedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } // Stuck for 5+ minutes
        })
        .toArray();
      
      if (stuckJobs.length > 0) {
        console.log('\n⚠️  STUCK JOBS DETECTED:');
        console.log(`   ${stuckJobs.length} jobs have been processing for >5 minutes.`);
        console.log('   These may need to be reset or the worker may have crashed.');
      }
    }
    
    await client.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

diagnose();
