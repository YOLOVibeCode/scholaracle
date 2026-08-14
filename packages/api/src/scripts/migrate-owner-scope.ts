/* eslint-disable no-console -- CLI script: console output is its interface */
/**
 * One-off migration: rekey share-scoped slc_* data into the student owner's partition.
 *
 * Background
 * ----------
 * Prior to the owner-scoped data model, slc_* rows were written under the ingesting
 * actor's userId (which could be a co-parent with accepted shared access).  The new
 * model always writes under student.userId (the primary owner), so any data previously
 * written under a co-parent must be moved.
 *
 * What this script does
 * ---------------------
 * For each student that has accepted sharedWith members:
 *   1. For each slc_* collection, find rows keyed by a co-parent's userId
 *      that match the student's externalId (studentExternalId) or
 *      the co-parent's userId (both institutionExternalId paths).
 *   2. Upsert each row into the owner's partition (owner userId wins on conflict).
 *   3. Soft-delete (set deletedAt) the co-parent copy.
 *   4. Re-point slc_sources / slc_runs the same way.
 *   5. Rewrite slc_assignment_comments: set userId → owner, keep authorEmail/authorRole.
 *
 * Usage
 * -----
 *   # Dry run (no writes) — print a report:
 *   MONGODB_URI=... npx ts-node src/scripts/migrate-owner-scope.ts --dry-run
 *
 *   # Apply on Railway dev only:
 *   MONGODB_URI=... npx ts-node src/scripts/migrate-owner-scope.ts --apply
 *
 * Gate: set ALLOW_PROD_MIGRATION=1 to allow running against a production DB name.
 */

import { MongoClient, type Db, type Document, type ObjectId } from 'mongodb';

const SLC_ENTITY_COLLECTIONS = [
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
] as const;

interface IMigrationStats {
  studentsScanned: number;
  coParentsWithData: number;
  rowsRekeyed: number;
  rowsSkipped: number;
  sourcesMigrated: number;
  runsMigrated: number;
  commentsMigrated: number;
}

async function migrateStudent(
  db: Db,
  ownerUserId: string,
  coParentUserId: string,
  studentExternalId: string | undefined,
  stats: IMigrationStats,
  apply: boolean
): Promise<void> {
  // slc_* entity collections
  for (const collName of SLC_ENTITY_COLLECTIONS) {
    const coll = db.collection(collName);

    const query: Record<string, unknown> = { userId: coParentUserId };
    if (studentExternalId) query['studentExternalId'] = studentExternalId;

    const docs = await coll.find(query).toArray();
    for (const doc of docs) {
      const ownerFilter: Record<string, unknown> = {
        userId: ownerUserId,
        provider: doc['provider'],
        adapterId: doc['adapterId'],
        externalId: doc['externalId'],
        studentExternalId: doc['studentExternalId'] ?? null,
        institutionExternalId: doc['institutionExternalId'] ?? null,
        courseExternalId: doc['courseExternalId'] ?? null,
        termExternalId: doc['termExternalId'] ?? null,
      };

      const ownerExists = await coll.findOne(ownerFilter);
      if (ownerExists) {
        stats.rowsSkipped++;
        if (!apply) {
          console.log(
            `  [skip] ${collName} externalId=${String(doc['externalId'])} already exists under owner`
          );
        }
      } else {
        stats.rowsRekeyed++;
        if (apply) {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          const { _id: _docId, ...rest } = doc as Document & { _id: ObjectId };
          void _docId;
          await coll.insertOne({ ...rest, userId: ownerUserId });
        } else {
          console.log(
            `  [rekey] ${collName} externalId=${String(doc['externalId'])} → owner ${ownerUserId}`
          );
        }
      }

      // Soft-delete the co-parent copy
      if (apply) {
        await coll.updateOne(
          { _id: (doc as Document & { _id: ObjectId })._id },
          { $set: { deletedAt: new Date(), _migratedToOwner: ownerUserId } }
        );
      }
    }
  }

  // slc_sources
  {
    const coll = db.collection('slc_sources');
    const sourceDocs = await coll.find({ userId: coParentUserId }).toArray();
    for (const src of sourceDocs) {
      stats.sourcesMigrated++;
      if (apply) {
        await coll.updateOne(
          { userId: ownerUserId, sourceId: src['sourceId'] },
          { $setOnInsert: { ...src, userId: ownerUserId } },
          { upsert: true }
        );
        await coll.deleteOne({ _id: (src as Document & { _id: ObjectId })._id });
      } else {
        console.log(`  [source] ${String(src['sourceId'])} → owner ${ownerUserId}`);
      }
    }
  }

  // slc_runs
  {
    const coll = db.collection('slc_runs');
    const runDocs = await coll.find({ userId: coParentUserId }).toArray();
    for (const run of runDocs) {
      stats.runsMigrated++;
      if (apply) {
        await coll.updateOne(
          { _id: (run as Document & { _id: ObjectId })._id },
          {
            $set: {
              userId: ownerUserId,
              actorUserId: coParentUserId,
              _migratedToOwner: ownerUserId,
            },
          }
        );
      } else {
        console.log(`  [run] runId=${String(run['runId'])} → owner ${ownerUserId}`);
      }
    }
  }

  // slc_assignment_comments: rewrite userId → owner, keep authorEmail/authorRole
  {
    const coll = db.collection('slc_assignment_comments');
    const commentDocs = await coll.find({ userId: coParentUserId }).toArray();
    for (const comment of commentDocs) {
      stats.commentsMigrated++;
      if (apply) {
        await coll.updateOne(
          { _id: (comment as Document & { _id: ObjectId })._id },
          {
            $set: {
              userId: ownerUserId,
              authorUserId: coParentUserId,
              _migratedToOwner: ownerUserId,
            },
          }
        );
      } else {
        console.log(
          `  [comment] _id=${String((comment as Document & { _id: ObjectId })._id)} → owner ${ownerUserId}`
        );
      }
    }
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const uri = process.env['MONGODB_URI'];
  const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle';
  if (!uri) throw new Error('MONGODB_URI required');

  if (!apply) {
    console.log('=== DRY RUN — no writes will be made (pass --apply to persist) ===');
  }

  const isProd = dbName.toLowerCase().includes('prod') || dbName === 'scholaracle';
  if (isProd && apply && !process.env['ALLOW_PROD_MIGRATION']) {
    throw new Error(
      'Refusing to apply migration to a production-named database. Set ALLOW_PROD_MIGRATION=1 to override.'
    );
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    console.log(`Connected to database: ${dbName}`);

    const stats: IMigrationStats = {
      studentsScanned: 0,
      coParentsWithData: 0,
      rowsRekeyed: 0,
      rowsSkipped: 0,
      sourcesMigrated: 0,
      runsMigrated: 0,
      commentsMigrated: 0,
    };

    const students = await db
      .collection('students')
      .find({ 'sharedWith.0': { $exists: true } })
      .toArray();

    for (const student of students) {
      stats.studentsScanned++;
      const ownerUserId = String(student['userId']);
      const studentExternalId = student['studentId'] as string | undefined;
      const sharedWith = (
        student['sharedWith'] as Array<{ userId?: string; status?: string }>
      ).filter((s) => s.status === 'accepted' && s.userId);

      if (sharedWith.length === 0) continue;

      console.log(
        `\nStudent: ${String(student['name'])} (owner=${ownerUserId}, extId=${studentExternalId ?? 'none'})`
      );

      for (const sp of sharedWith) {
        const coParentUserId = sp.userId!;
        console.log(`  Co-parent: ${coParentUserId}`);

        await migrateStudent(db, ownerUserId, coParentUserId, studentExternalId, stats, apply);
        stats.coParentsWithData++;
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Students scanned:     ${stats.studentsScanned}`);
    console.log(`Co-parents with data: ${stats.coParentsWithData}`);
    console.log(`Rows rekeyed:         ${stats.rowsRekeyed}`);
    console.log(`Rows skipped (exist): ${stats.rowsSkipped}`);
    console.log(`Sources migrated:     ${stats.sourcesMigrated}`);
    console.log(`Runs migrated:        ${stats.runsMigrated}`);
    console.log(`Comments migrated:    ${stats.commentsMigrated}`);
    if (!apply) {
      console.log('\nRe-run with --apply to persist changes.');
    } else {
      console.log('\nMigration complete.');
    }
  } finally {
    await client.close();
  }
}

main().catch((err: unknown) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
