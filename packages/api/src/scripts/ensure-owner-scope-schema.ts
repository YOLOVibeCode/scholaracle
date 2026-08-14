/* eslint-disable no-console -- CLI script: console output is its interface */
/**
 * Inventory Mongo collections/indexes, apply canonical indexes, and report
 * owner-scope occupancy (slc_* rows keyed by a co-parent instead of owner).
 *
 * Usage:
 *   railway run --project <id> --environment dev --service api -- \
 *     npx ts-node src/scripts/ensure-owner-scope-schema.ts
 *
 *   railway run --project <id> --environment production --service api -- \
 *     npx ts-node src/scripts/ensure-owner-scope-schema.ts
 *
 * Never prints connection strings or document contents.
 */

import { MongoClient } from 'mongodb';
import { createIndexes } from '@scholaracle/database';

const SLC_COLLECTIONS = [
  'slc_assignments',
  'slc_courses',
  'slc_grade_snapshots',
  'slc_grade_history',
  'slc_course_materials',
  'slc_event_series',
  'slc_event_overrides',
  'slc_attendance_events',
  'slc_academic_terms',
  'slc_institutions',
  'slc_teachers',
  'slc_messages',
  'slc_student_profiles',
  'slc_activity_log',
  'slc_assignment_reconciliation',
  'slc_sources',
  'slc_runs',
  'slc_assignment_comments',
  'slc_assets',
] as const;

async function main(): Promise<void> {
  const uri = process.env['MONGODB_URI'];
  const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle';
  if (!uri) throw new Error('MONGODB_URI required');

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    console.log(`Database: ${dbName}`);

    const existing = await db.listCollections().toArray();
    const names = existing.map((c) => c.name).sort();
    console.log(`\nCollections (${names.length}):`);
    for (const name of names) {
      const count = await db.collection(name).estimatedDocumentCount();
      console.log(`  ${name}: ${count}`);
    }

    console.log('\nApplying canonical indexes...');
    await createIndexes(db);

    console.log('\nIndex inventory (students + existing slc_*):');
    const existingSet = new Set(names);
    const indexTargets = ['students', ...SLC_COLLECTIONS].filter(
      (name) => name === 'students' || existingSet.has(name)
    );
    for (const name of indexTargets) {
      const coll = db.collection(name);
      const indexes = await coll.indexes();
      const compact = indexes.map((idx) => ({
        name: idx.name,
        key: idx.key,
        unique: idx.unique === true ? true : undefined,
        sparse: idx.sparse === true ? true : undefined,
      }));
      console.log(`  ${name}: ${JSON.stringify(compact)}`);
    }

    const leftover = await db
      .listCollections({ name: { $in: ['ingestSources', 'ingest_sources'] } })
      .toArray();
    for (const leftoverColl of leftover) {
      const n = await db.collection(leftoverColl.name).estimatedDocumentCount();
      const sample = await db.collection(leftoverColl.name).findOne({});
      const fields = sample ? Object.keys(sample).sort() : [];
      console.log(
        `\nWARNING: leftover collection ${leftoverColl.name} has ${n} docs (canonical is slc_sources); fields=${JSON.stringify(fields)}`
      );
    }

    const students = await db
      .collection('students')
      .find({ 'sharedWith.0': { $exists: true } })
      .project({ userId: 1, studentId: 1, name: 1, sharedWith: 1 })
      .toArray();

    let acceptedShares = 0;
    let coparentKeyedRows = 0;
    for (const student of students) {
      const studentExternalId = student['studentId'] as string | undefined;
      const shared = (
        (student['sharedWith'] as Array<{ userId?: string; status?: string }>) ?? []
      ).filter((s) => s.status === 'accepted' && s.userId);
      acceptedShares += shared.length;
      for (const sp of shared) {
        const coparentId = sp.userId!;
        for (const collName of SLC_COLLECTIONS) {
          const query: Record<string, unknown> = { userId: coparentId };
          if (studentExternalId && collName !== 'slc_sources' && collName !== 'slc_runs') {
            query['studentExternalId'] = studentExternalId;
          }
          coparentKeyedRows += await db.collection(collName).countDocuments(query);
        }
      }
    }

    console.log('\nOwner-scope occupancy:');
    console.log(`  students with sharedWith: ${students.length}`);
    console.log(`  accepted co-parents: ${acceptedShares}`);
    console.log(`  slc_* docs still keyed by co-parent: ${coparentKeyedRows}`);
  } finally {
    await client.close();
  }
}

main().catch((err: unknown) => {
  console.error('ensure-owner-scope-schema failed:', err);
  process.exit(1);
});
