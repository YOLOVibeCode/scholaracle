/**
 * End-to-end scraper test via Docker worker.
 * Run INSIDE the workers container:
 *   docker compose exec workers node /app/scripts/test-e2e-scraper.js
 *
 * Or from host (with CREDENTIALS_ENCRYPTION_KEY set):
 *   CREDENTIALS_ENCRYPTION_KEY=... node scripts/test-e2e-scraper.js
 */
const { MongoClient, ObjectId } = require('mongodb');
const { createCipheriv, randomBytes } = require('node:crypto');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:2802/scholaracle';
const DB_NAME = process.env.MONGODB_DB_NAME || 'scholaracle';

// ----- Encryption (same as API credentialsCipher.ts) -----
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const TAG_LENGTH = 16;

function getKey() {
  const secret = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!secret) return null;
  if (secret.length === 64 && /^[0-9a-fA-F]+$/i.test(secret)) {
    return Buffer.from(secret, 'hex');
  }
  return secret.length >= KEY_LENGTH ? Buffer.from(secret, 'utf8').subarray(0, KEY_LENGTH) : null;
}

function encrypt(plain) {
  const key = getKey();
  if (!key) throw new Error('CREDENTIALS_ENCRYPTION_KEY not set or too short');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return { encrypted: encrypted.toString('base64'), iv: iv.toString('base64') };
}

// ----- Credentials for Ava Lewis -----
const CANVAS_CREDS = {
  username: '29alewis@ldisd.net',
  password: 'avalewisldhs',
  loginMethod: 'google_sso',
};

const SKYWARD_CREDS = {
  username: 'Jessica.Lewis',
  password: '123456789',
  loginMethod: 'direct',
};

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log('=== E2E Scraper Pipeline Test ===\n');

  // 1. Encrypt credentials
  console.log('1. Encrypting credentials...');
  const canvasEnc = encrypt(JSON.stringify(CANVAS_CREDS));
  const skywardEnc = encrypt(JSON.stringify(SKYWARD_CREDS));
  console.log('   Canvas encrypted ✓');
  console.log('   Skyward encrypted ✓');

  // 2. Create test student with both data sources
  const userId = new ObjectId();
  const studentId = (await db.collection('students').insertOne({
    userId,
    name: 'Ava Lewis',
    grade: '9',
    dataSources: [
      {
        pluginId: 'canvas::default',
        displayName: 'LDISD Canvas',
        config: { institutionUrl: 'https://ldisd.instructure.com' },
        enabled: true,
        credentials: canvasEnc,
      },
      {
        pluginId: 'skyward::default',
        displayName: 'LDISD Skyward',
        config: {
          institutionUrl: 'https://skyward.iscorp.com/scripts/wsisa.dll/WService=wscomlakedallastx/seplog01.w',
        },
        enabled: true,
        credentials: skywardEnc,
      },
    ],
    createdAt: new Date(),
  })).insertedId;

  console.log(`\n2. Created student: ${studentId}`);
  console.log(`   User: ${userId}`);

  // 3. Enqueue Canvas sync job
  const canvasRunId = `e2e-canvas-${Date.now()}`;
  const canvasJobId = (await db.collection('jobs').insertOne({
    type: 'sync',
    name: 'sync-student',
    data: {
      studentId: studentId.toString(),
      dataSourceIndex: 0,
      provider: 'canvas',
      adapterId: 'canvas::default',
      baseUrl: 'https://ldisd.instructure.com',
      userId: userId.toString(),
      runId: canvasRunId,
    },
    scheduledFor: new Date(),
    priority: 10,
    status: 'pending',
    attempts: 0,
    maxAttempts: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  })).insertedId;
  console.log(`\n3. Enqueued Canvas job: ${canvasJobId}`);

  // 4. Enqueue Skyward sync job
  const skywardRunId = `e2e-skyward-${Date.now()}`;
  const skywardJobId = (await db.collection('jobs').insertOne({
    type: 'sync',
    name: 'sync-student',
    data: {
      studentId: studentId.toString(),
      dataSourceIndex: 1,
      provider: 'skyward',
      adapterId: 'skyward::default',
      baseUrl: 'https://skyward.iscorp.com/scripts/wsisa.dll/WService=wscomlakedallastx/seplog01.w',
      userId: userId.toString(),
      runId: skywardRunId,
    },
    scheduledFor: new Date(),
    priority: 10,
    status: 'pending',
    attempts: 0,
    maxAttempts: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  })).insertedId;
  console.log(`   Enqueued Skyward job: ${skywardJobId}`);

  // 5. Poll both jobs
  console.log('\n4. Polling job status (every 5s, max 120s)...');
  const start = Date.now();
  let canvasDone = false;
  let skywardDone = false;

  while (Date.now() - start < 120000) {
    await new Promise(r => setTimeout(r, 5000));
    const elapsed = Math.round((Date.now() - start) / 1000);

    if (!canvasDone) {
      const cj = await db.collection('jobs').findOne({ _id: canvasJobId });
      console.log(`   [${elapsed}s] Canvas: status=${cj.status}, attempts=${cj.attempts}, error=${cj.lastError || 'none'}`);
      if (cj.status === 'completed' || cj.status === 'failed') canvasDone = true;
    }
    if (!skywardDone) {
      const sj = await db.collection('jobs').findOne({ _id: skywardJobId });
      console.log(`   [${elapsed}s] Skyward: status=${sj.status}, attempts=${sj.attempts}, error=${sj.lastError || 'none'}`);
      if (sj.status === 'completed' || sj.status === 'failed') skywardDone = true;
    }
    if (canvasDone && skywardDone) break;
  }

  // 6. Final results
  console.log('\n5. Final Job Results:');
  for (const [name, jobId] of [['Canvas', canvasJobId], ['Skyward', skywardJobId]]) {
    const job = await db.collection('jobs').findOne({ _id: jobId });
    console.log(`\n   ${name}:`);
    console.log(`     status: ${job.status}`);
    console.log(`     attempts: ${job.attempts}`);
    console.log(`     error: ${job.lastError || 'none'}`);
  }

  // 7. Sync runs
  console.log('\n6. Sync Run Records:');
  for (const [name, runId] of [['Canvas', canvasRunId], ['Skyward', skywardRunId]]) {
    const runs = await db.collection('sync_runs').find({ runId }).sort({ createdAt: -1 }).limit(1).toArray();
    if (runs.length > 0) {
      const r = runs[0];
      console.log(`\n   ${name} (${runId}):`);
      console.log(`     status: ${r.status}`);
      console.log(`     provider: ${r.provider}`);
      console.log(`     error: ${r.error || 'none'}`);
      if (r.summary) console.log(`     summary: ${JSON.stringify(r.summary)}`);
      if (r.durationMs) console.log(`     duration: ${r.durationMs}ms`);
    } else {
      console.log(`\n   ${name}: no run record found`);
    }
  }

  // 8. Worker heartbeats
  console.log('\n7. Worker Status:');
  const hb = await db.collection('worker_heartbeats').find({}).toArray();
  for (const h of hb) {
    console.log(`   ${h.workerId}: active=${h.activeSyncJobs}/${h.syncConcurrency}, mem=${JSON.stringify(h.memoryMB)}`);
  }

  await client.close();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
