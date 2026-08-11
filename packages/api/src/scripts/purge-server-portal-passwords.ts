/* eslint-disable no-console -- CLI script: console output is its interface */
/**
 * One-off migration: delete server-stored portal passwords for Canvas/Skyward/Aeries
 * after the account has at least one successful client-side run (meta.clientType set).
 *
 * Usage (from packages/api or workers with MONGODB_URI):
 *   npx ts-node src/scripts/purge-server-portal-passwords.ts --dry-run
 *   npx ts-node src/scripts/purge-server-portal-passwords.ts --apply
 *
 * Never logs credential values.
 */

import { MongoClient } from 'mongodb';

const PORTAL_PROVIDERS = new Set(['canvas', 'skyward', 'aeries']);

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const uri = process.env['MONGODB_URI'];
  const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle';
  if (!uri) throw new Error('MONGODB_URI required');

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const clientRuns = await db
    .collection('slc_runs')
    .find({
      status: 'committed',
      'clientMeta.clientType': { $in: ['mobile', 'browser-extension', 'cli'] },
    })
    .project({ userId: 1, sourceId: 1 })
    .toArray();

  const eligible = new Set(
    clientRuns.map((r) => `${String(r['userId'])}::${String(r['sourceId'])}`)
  );

  const students = await db.collection('students').find({}).toArray();
  let scanned = 0;
  let wouldPurge = 0;

  for (const student of students) {
    const sources = (student['dataSources'] as Array<Record<string, unknown>> | undefined) ?? [];
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i]!;
      const provider = String(src['provider'] ?? '');
      if (!PORTAL_PROVIDERS.has(provider)) continue;
      scanned += 1;
      const sourceId = String(src['id'] ?? src['sourceId'] ?? '');
      const userId = String(student['userId'] ?? student['ownerId'] ?? '');
      const key = `${userId}::${sourceId}`;
      if (!eligible.has(key)) continue;

      const creds = src['credentials'] as Record<string, unknown> | undefined;
      if (!creds || (!creds['password'] && !creds['username'])) continue;

      wouldPurge += 1;
      if (apply) {
        await db.collection('students').updateOne(
          { _id: student._id },
          {
            $unset: {
              [`dataSources.${i}.credentials.password`]: '',
              [`dataSources.${i}.credentials.username`]: '',
            },
          }
        );
      }
    }
  }

  console.log(
    JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      portalSourcesScanned: scanned,
      sourcesEligibleForPurge: wouldPurge,
    })
  );
  await client.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
