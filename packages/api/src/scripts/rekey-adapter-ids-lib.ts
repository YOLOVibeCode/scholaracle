/**
 * Re-key legacy built-in adapterIds to canonical canvas / skyward / aeries.
 */

import type { Db, Document, ObjectId } from 'mongodb';
import {
  isLegacyBuiltinAdapterId,
  LEGACY_BUILTIN_ADAPTER_IDS,
  resolveCanonicalAdapterId,
} from '@scholaracle/scraper-core';

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

const SIMPLE_ADAPTER_ID_COLLECTIONS = [
  'slc_sources',
  'slc_assets',
  'slc_assignment_comments',
] as const;

export const ADAPTER_ID_ENTITY_COLLECTIONS = [
  ...SLC_ENTITY_COLLECTIONS,
  ...SIMPLE_ADAPTER_ID_COLLECTIONS,
] as const;

export interface ICollectionRekeyCounts {
  wouldUpdate: number;
  wouldMerge: number;
}

export interface IRekeyAdapterIdStats {
  readonly byCollection: Record<string, ICollectionRekeyCounts>;
  readonly studentsDataSourcesUpdated: number;
  readonly sourceInvitesUpdated: number;
  readonly legacyCounts: Record<string, number>;
}

function identityFilter(doc: Document, adapterId: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    userId: doc['userId'],
    provider: doc['provider'],
    adapterId,
    externalId: doc['externalId'],
    studentExternalId: doc['studentExternalId'] ?? null,
    institutionExternalId: doc['institutionExternalId'] ?? null,
  };
  if (doc['courseExternalId'] !== undefined) {
    base['courseExternalId'] = doc['courseExternalId'] ?? null;
  }
  if (doc['termExternalId'] !== undefined) {
    base['termExternalId'] = doc['termExternalId'] ?? null;
  }
  return base;
}

function observedAtMs(doc: Document): number {
  const observed = doc['observedAt'];
  if (observed instanceof Date) return observed.getTime();
  if (typeof observed === 'string') {
    const parsed = Date.parse(observed);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  const updated = doc['updatedAt'];
  if (updated instanceof Date) return updated.getTime();
  return 0;
}

async function rekeyCollectionDocs(
  db: Db,
  collName: string,
  apply: boolean,
  counts: ICollectionRekeyCounts
): Promise<void> {
  const coll = db.collection(collName);
  const cursor = coll.find({
    adapterId: { $in: [...LEGACY_BUILTIN_ADAPTER_IDS] },
  });
  for await (const doc of cursor) {
    const legacyId = String(doc['adapterId']);
    if (!isLegacyBuiltinAdapterId(legacyId)) continue;
    const canonical = resolveCanonicalAdapterId(legacyId);
    const canonicalFilter = identityFilter(doc, canonical);
    const existing = await coll.findOne(canonicalFilter);
    if (existing) {
      counts.wouldMerge++;
      if (apply) {
        const legacyMs = observedAtMs(doc);
        const canonicalMs = observedAtMs(existing);
        if (legacyMs > canonicalMs) {
          await coll.updateOne(
            { _id: existing['_id'] as ObjectId },
            { $set: { deletedAt: new Date(), _adapterIdRekeyMerged: canonical } }
          );
          await coll.updateOne(
            { _id: doc['_id'] as ObjectId },
            { $set: { adapterId: canonical, deletedAt: null } }
          );
        } else {
          await coll.updateOne(
            { _id: doc['_id'] as ObjectId },
            {
              $set: {
                deletedAt: new Date(),
                adapterId: canonical,
                _adapterIdRekeyMerged: canonical,
              },
            }
          );
        }
      }
      continue;
    }
    counts.wouldUpdate++;
    if (apply) {
      await coll.updateOne({ _id: doc['_id'] as ObjectId }, { $set: { adapterId: canonical } });
    }
  }
}

async function rekeyStudentsPluginIds(db: Db, apply: boolean): Promise<number> {
  let count = 0;
  const students = db.collection('students');
  const cursor = students.find({
    'dataSources.pluginId': { $in: [...LEGACY_BUILTIN_ADAPTER_IDS] },
  });
  for await (const student of cursor) {
    const dataSources = (student['dataSources'] as Array<Record<string, unknown>>) ?? [];
    let changed = false;
    const next = dataSources.map((ds) => {
      const pluginId = String(ds['pluginId'] ?? '');
      if (!isLegacyBuiltinAdapterId(pluginId)) return ds;
      changed = true;
      count++;
      return { ...ds, pluginId: resolveCanonicalAdapterId(pluginId) };
    });
    if (changed && apply) {
      await students.updateOne({ _id: student['_id'] }, { $set: { dataSources: next } });
    } else if (changed) {
      // dry-run counts per matching pluginId only once in loop
    }
  }
  return count;
}

async function rekeySourceInvites(db: Db, apply: boolean): Promise<number> {
  let count = 0;
  const invites = db.collection('source_invites');
  const cursor = invites.find({
    'payload.adapterId': { $in: [...LEGACY_BUILTIN_ADAPTER_IDS] },
  });
  for await (const invite of cursor) {
    const payload = invite['payload'] as Record<string, unknown> | undefined;
    const adapterId = String(payload?.['adapterId'] ?? '');
    if (!isLegacyBuiltinAdapterId(adapterId)) continue;
    count++;
    if (apply) {
      await invites.updateOne(
        { _id: invite['_id'] },
        {
          $set: {
            'payload.adapterId': resolveCanonicalAdapterId(adapterId),
          },
        }
      );
    }
  }
  return count;
}

function activeAdapterIdFilter(legacy: string): Record<string, unknown> {
  return {
    adapterId: legacy,
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
  };
}

export async function countLegacyAdapterIds(db: Db): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const legacy of LEGACY_BUILTIN_ADAPTER_IDS) {
    let total = 0;
    for (const collName of ADAPTER_ID_ENTITY_COLLECTIONS) {
      total += await db.collection(collName).countDocuments(activeAdapterIdFilter(legacy));
    }
    total += await db.collection('students').countDocuments({
      'dataSources.pluginId': legacy,
    });
    total += await db.collection('source_invites').countDocuments({
      'payload.adapterId': legacy,
    });
    if (total > 0) result[legacy] = total;
  }
  return result;
}

async function rekeySimpleCollection(
  db: Db,
  collName: string,
  apply: boolean,
  counts: ICollectionRekeyCounts
): Promise<void> {
  const coll = db.collection(collName);
  for (const legacy of LEGACY_BUILTIN_ADAPTER_IDS) {
    const match = await coll.countDocuments({ adapterId: legacy });
    if (match === 0) continue;
    counts.wouldUpdate += match;
    if (apply) {
      await coll.updateMany(
        { adapterId: legacy },
        { $set: { adapterId: resolveCanonicalAdapterId(legacy) } }
      );
    }
  }
}

export async function rekeyAdapterIds(params: {
  readonly db: Db;
  readonly apply: boolean;
}): Promise<IRekeyAdapterIdStats> {
  const byCollection: Record<string, ICollectionRekeyCounts> = {};
  for (const collName of SLC_ENTITY_COLLECTIONS) {
    const counts = { wouldUpdate: 0, wouldMerge: 0 };
    await rekeyCollectionDocs(params.db, collName, params.apply, counts);
    if (counts.wouldUpdate > 0 || counts.wouldMerge > 0) {
      byCollection[collName] = counts;
    }
  }
  for (const collName of SIMPLE_ADAPTER_ID_COLLECTIONS) {
    const counts = { wouldUpdate: 0, wouldMerge: 0 };
    await rekeySimpleCollection(params.db, collName, params.apply, counts);
    if (counts.wouldUpdate > 0) {
      byCollection[collName] = counts;
    }
  }
  const studentsDataSourcesUpdated = await rekeyStudentsPluginIds(params.db, params.apply);
  const sourceInvitesUpdated = await rekeySourceInvites(params.db, params.apply);
  const legacyCounts = params.apply ? await countLegacyAdapterIds(params.db) : {};
  return {
    byCollection,
    studentsDataSourcesUpdated,
    sourceInvitesUpdated,
    legacyCounts,
  };
}
