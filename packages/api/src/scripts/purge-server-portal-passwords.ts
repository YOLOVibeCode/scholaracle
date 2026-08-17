/* eslint-disable no-console -- CLI script: console output is its interface */
/**
 * Migration: purge server-stored encrypted credential blobs for all portal providers.
 *
 * The server no longer accepts, stores, or uses school portal credentials
 * (canvas, skyward, aeries, google-classroom, oneroster). This script unsets
 * the `dataSources[n].credentials` field for any data source whose provider
 * matches these providers.
 *
 * Data stored as `{ encrypted, iv }` (AES-256-GCM blobs) — never log or
 * output credential values.
 *
 * Usage (from packages/api with MONGODB_URI set):
 *   npx ts-node src/scripts/purge-server-portal-passwords.ts --dry-run
 *   npx ts-node src/scripts/purge-server-portal-passwords.ts --apply
 *
 * Run on UAT first, then production.
 */

import { MongoClient } from 'mongodb';

const PURGE_PROVIDERS = new Set(['canvas', 'skyward', 'aeries', 'google-classroom', 'oneroster']);

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const uri = process.env['MONGODB_URI'];
  const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle';
  if (!uri) throw new Error('MONGODB_URI is required');

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(dbName);
    const students = await db.collection('students').find({}).toArray();

    let studentsScanned = 0;
    let sourcesWithCredentials = 0;
    let sourcesUpdated = 0;

    for (const student of students) {
      studentsScanned += 1;
      const sources = (student['dataSources'] as Array<Record<string, unknown>> | undefined) ?? [];
      const unsetOps: Record<string, string> = {};

      for (let i = 0; i < sources.length; i++) {
        const src = sources[i]!;
        const provider = String(src['provider'] ?? '');
        if (!PURGE_PROVIDERS.has(provider)) continue;

        const creds = src['credentials'] as Record<string, unknown> | undefined;
        if (!creds || Object.keys(creds).length === 0) continue;

        // Credential blob present — queue for removal.
        sourcesWithCredentials += 1;
        unsetOps[`dataSources.${i}.credentials`] = '';
      }

      if (Object.keys(unsetOps).length === 0) continue;

      sourcesUpdated += Object.keys(unsetOps).length;
      if (apply) {
        await db.collection('students').updateOne({ _id: student._id }, { $unset: unsetOps });
      }
    }

    console.log(
      JSON.stringify({
        mode: apply ? 'apply' : 'dry-run',
        studentsScanned,
        sourcesWithCredentials,
        sourcesUpdated: apply ? sourcesUpdated : 0,
        wouldUpdate: !apply ? sourcesUpdated : undefined,
        providers: [...PURGE_PROVIDERS].join(', '),
      })
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
