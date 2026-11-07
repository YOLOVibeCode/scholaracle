/* eslint-disable no-console -- CLI script: console output is its interface */
/**
 * One-off migration: re-key legacy built-in adapterIds → canvas / skyward / aeries.
 *
 *   MONGODB_URI=... npx ts-node src/scripts/rekey-adapter-ids.ts --dry-run
 *   MONGODB_URI=... npx ts-node src/scripts/rekey-adapter-ids.ts --apply
 *
 * Set ALLOW_PROD_MIGRATION=1 to allow running against a production DB name.
 */

import { MongoClient } from 'mongodb';
import { BUILTIN_ADAPTER_ID_ALIASES } from '@scholaracle/scraper-core';
import { ExternalIdAliasRepository } from '@scholaracle/database';
import { countLegacyAdapterIds, rekeyAdapterIds } from './rekey-adapter-ids-lib';

async function main(): Promise<void> {
  const uri = process.env['MONGODB_URI'];
  if (!uri) {
    console.error('MONGODB_URI is required');
    process.exit(1);
  }
  const apply = process.argv.includes('--apply');
  const dryRun = process.argv.includes('--dry-run') || !apply;
  if (!apply && !dryRun) {
    console.error('Pass --dry-run (default) or --apply');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle';
  if (dbName.includes('prod') && process.env['ALLOW_PROD_MIGRATION'] !== '1') {
    console.error('Refusing production DB without ALLOW_PROD_MIGRATION=1');
    process.exit(1);
  }
  const db = client.db(dbName);

  try {
    const aliasRepo = new ExternalIdAliasRepository(db);
    await aliasRepo.upsertBuiltinAdapterAliases(BUILTIN_ADAPTER_ID_ALIASES);

    const before = await countLegacyAdapterIds(db);
    console.log('=== Legacy adapterId counts (before) ===');
    for (const [id, count] of Object.entries(before)) {
      console.log(`  ${id}: ${count}`);
    }
    if (Object.keys(before).length === 0) {
      console.log('  (none)');
    }

    const stats = await rekeyAdapterIds({ db, apply });
    console.log('\n=== Re-key plan ===');
    for (const [coll, counts] of Object.entries(stats.byCollection)) {
      console.log(`  ${coll}: update=${counts.wouldUpdate} merge=${counts.wouldMerge}`);
    }
    console.log(`  students.dataSources.pluginId: ${stats.studentsDataSourcesUpdated}`);
    console.log(`  source_invites.payload.adapterId: ${stats.sourceInvitesUpdated}`);

    if (apply) {
      const after = await countLegacyAdapterIds(db);
      console.log('\n=== Legacy adapterId counts (after) ===');
      if (Object.keys(after).length === 0) {
        console.log('  (none)');
      } else {
        for (const [id, count] of Object.entries(after)) {
          console.log(`  ${id}: ${count}`);
        }
      }
    } else {
      console.log('\nRe-run with --apply to persist changes.');
    }
  } finally {
    await client.close();
  }
}

main().catch((err: unknown) => {
  console.error('Re-key failed:', err);
  process.exit(1);
});
