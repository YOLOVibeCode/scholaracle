/**
 * Integration test: Enqueue a sync job and watch the Docker worker process it.
 * Run: node scripts/test-worker-pipeline.mjs
 */
import { MongoClient, ObjectId } from 'mongodb';

const MONGO_URI = 'mongodb://localhost:2802/scholaracle';

const client = new MongoClient(MONGO_URI);
await client.connect();
const db = client.db('scholaracle');

console.log('=== 1. Worker Heartbeats ===');
const heartbeats = await db.collection('worker_heartbeats').find({}).toArray();
if (heartbeats.length === 0) {
  console.log('  No workers reporting. Is the workers container running?');
} else {
  for (const h of heartbeats) {
    console.log(`  ${h.workerId}: concurrency=${h.syncConcurrency}, active=${h.activeSyncJobs}, mem=${JSON.stringify(h.memoryMB)}`);
  }
}

console.log('\n=== 2. Queue Stats (before) ===');
const statsBefore = await db.collection('jobs').aggregate([
  { $match: { type: 'sync' } },
  { $group: { _id: '$status', count: { $sum: 1 } } },
]).toArray();
console.log('  ', statsBefore.length > 0 ? statsBefore.map(s => `${s._id}: ${s.count}`).join(', ') : 'empty');

console.log('\n=== 3. Enqueuing test sync job (canvas) ===');
const runId = `test-run-${Date.now()}`;
const jobResult = await db.collection('jobs').insertOne({
  type: 'sync',
  name: 'sync-student',
  data: {
    studentId: new ObjectId().toString(),
    dataSourceIndex: 0,
    provider: 'canvas',
    adapterId: 'canvas::default',
    baseUrl: 'https://canvas.instructure.com',
    userId: new ObjectId().toString(),
    runId,
    credentials: { encrypted: 'ZmFrZQ==', iv: 'ZmFrZQ==' },
  },
  scheduledFor: new Date(),
  priority: 10,
  status: 'pending',
  attempts: 0,
  maxAttempts: 2,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const jobId = jobResult.insertedId;
console.log(`  Job ID: ${jobId}`);
console.log(`  Run ID: ${runId}`);

console.log('\n=== 4. Polling job status (every 2s, max 30s) ===');
const startTime = Date.now();
let finalStatus = 'pending';
while (Date.now() - startTime < 30000) {
  await new Promise(r => setTimeout(r, 2000));
  const job = await db.collection('jobs').findOne({ _id: jobId });
  if (!job) {
    console.log('  Job disappeared (TTL?)');
    break;
  }
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`  [${elapsed}s] status=${job.status}, attempts=${job.attempts}, error=${job.lastError ?? 'none'}, lockedBy=${job.lockedBy ?? 'none'}`);
  finalStatus = job.status;
  if (job.status === 'completed' || job.status === 'failed') break;
}

console.log('\n=== 5. Final Result ===');
const finalJob = await db.collection('jobs').findOne({ _id: jobId });
console.log(JSON.stringify({
  status: finalJob?.status,
  attempts: finalJob?.attempts,
  lastError: finalJob?.lastError,
  lockedBy: finalJob?.lockedBy,
  completedAt: finalJob?.completedAt,
  failedAt: finalJob?.failedAt,
}, null, 2));

// Check sync_runs
const syncRun = await db.collection('sync_runs').findOne({ runId });
if (syncRun) {
  console.log('\n=== 6. Sync Run Record ===');
  console.log(JSON.stringify({
    status: syncRun.status,
    provider: syncRun.provider,
    error: syncRun.error,
    summary: syncRun.summary,
    startedAt: syncRun.startedAt,
    completedAt: syncRun.completedAt,
  }, null, 2));
} else {
  console.log('\n=== 6. No sync_run record found ===');
}

// Check worker logs
console.log('\n=== 7. Worker Heartbeats (after) ===');
const after = await db.collection('worker_heartbeats').find({}).toArray();
for (const h of after) {
  console.log(`  ${h.workerId}: active=${h.activeSyncJobs}`);
}

await client.close();
console.log('\nDone.');
