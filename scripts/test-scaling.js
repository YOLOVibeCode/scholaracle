/**
 * Horizontal scaling test: enqueue 6 Skyward jobs and watch 3 workers process them.
 * Run from: docker compose exec -w /app/packages/workers workers node /app/packages/workers/test-scaling.js
 */
const { MongoClient, ObjectId } = require('mongodb');
const { createCipheriv, randomBytes } = require('node:crypto');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:2802/scholaracle';
const DB_NAME = process.env.MONGODB_DB_NAME || 'scholaracle';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const TAG_LENGTH = 16;

function getKey() {
  const secret = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!secret) throw new Error('CREDENTIALS_ENCRYPTION_KEY not set');
  if (secret.length === 64 && /^[0-9a-fA-F]+$/i.test(secret)) return Buffer.from(secret, 'hex');
  return secret.length >= KEY_LENGTH ? Buffer.from(secret, 'utf8').subarray(0, KEY_LENGTH) : null;
}

function encrypt(plain) {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return { encrypted: encrypted.toString('base64'), iv: iv.toString('base64') };
}

const SKYWARD_CREDS = { username: 'Jessica.Lewis', password: '123456789', loginMethod: 'direct' };
const SKYWARD_URL = 'https://skyward.iscorp.com/scripts/wsisa.dll/WService=wscomlakedallastx/seplog01.w';
const NUM_JOBS = 6;

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log('=== Horizontal Scaling Test ===\n');

  // Show initial capacity
  const hb = await db.collection('worker_heartbeats').find({}).toArray();
  console.log(`Workers: ${hb.length}, Total slots: ${hb.reduce((s,h) => s + h.syncConcurrency, 0)}`);

  // Create students with encrypted credentials
  const skywardEnc = encrypt(JSON.stringify(SKYWARD_CREDS));
  const jobIds = [];

  console.log(`\nEnqueuing ${NUM_JOBS} Skyward jobs...`);
  for (let i = 0; i < NUM_JOBS; i++) {
    const userId = new ObjectId();
    const studentId = (await db.collection('students').insertOne({
      userId,
      name: `Scale Test ${i + 1}`,
      dataSources: [{
        pluginId: 'skyward::default',
        displayName: 'LDISD Skyward',
        config: { institutionUrl: SKYWARD_URL },
        enabled: true,
        credentials: skywardEnc,
      }],
      createdAt: new Date(),
    })).insertedId;

    const jobId = (await db.collection('jobs').insertOne({
      type: 'sync',
      name: 'sync-student',
      data: {
        studentId: studentId.toString(),
        dataSourceIndex: 0,
        provider: 'skyward',
        adapterId: 'skyward::default',
        baseUrl: SKYWARD_URL,
        userId: userId.toString(),
        runId: `scale-test-${i}-${Date.now()}`,
      },
      scheduledFor: new Date(),
      priority: 10,
      status: 'pending',
      attempts: 0,
      maxAttempts: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    })).insertedId;
    jobIds.push(jobId);
    console.log(`  Job ${i + 1}: ${jobId}`);
  }

  // Poll all jobs
  console.log(`\nPolling ${NUM_JOBS} jobs (every 5s, max 180s)...`);
  const start = Date.now();
  const completionTimes = {};

  while (Date.now() - start < 180000) {
    await new Promise(r => setTimeout(r, 5000));
    const elapsed = Math.round((Date.now() - start) / 1000);

    // Check heartbeats for active job distribution
    const workers = await db.collection('worker_heartbeats').find({}).toArray();
    const activeByWorker = workers.map(w => `${w.workerId.split('-').pop()}:${w.activeSyncJobs}`).join(', ');

    let allDone = true;
    const statuses = [];
    for (let i = 0; i < jobIds.length; i++) {
      const job = await db.collection('jobs').findOne({ _id: jobIds[i] });
      statuses.push(job.status[0].toUpperCase()); // P/C/F first char
      if (job.status !== 'completed' && job.status !== 'failed') {
        allDone = false;
      } else if (!completionTimes[i]) {
        completionTimes[i] = elapsed;
      }
    }

    console.log(`  [${elapsed}s] Jobs: [${statuses.join(',')}]  Workers: [${activeByWorker}]`);
    if (allDone) break;
  }

  // Summary
  console.log('\n=== Results ===');
  for (let i = 0; i < jobIds.length; i++) {
    const job = await db.collection('jobs').findOne({ _id: jobIds[i] });
    const syncRun = await db.collection('sync_runs').findOne({ jobId: jobIds[i].toString() });
    const lockedBy = syncRun?.lockedBy || job.lockedBy || 'unknown';
    console.log(`  Job ${i + 1}: ${job.status} (${completionTimes[i] || '?'}s) worker=${lockedBy} error=${job.lastError || 'none'}`);
  }

  // Final capacity
  const hbFinal = await db.collection('worker_heartbeats').find({}).toArray();
  console.log(`\nWorkers after: ${hbFinal.length}`);
  for (const h of hbFinal) {
    console.log(`  ${h.workerId}: active=${h.activeSyncJobs}, mem=${JSON.stringify(h.memoryMB)}`);
  }

  await client.close();
  console.log('\nDone.');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
