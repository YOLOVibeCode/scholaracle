import { createHash } from 'node:crypto';
import type { Db } from 'mongodb';
import { LlmClient } from '@scholaracle/agents';
import { mergeCourses, type ISourceCourse } from '@scholaracle/connector';
import { resolveLlmConfig } from '../llm/resolveLlmConfig';

export interface IBatchMaterialMatcherResult {
  readonly llmCallCount: number;
  readonly matchedCount: number;
}

function hashPayload(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function assignmentListHash(assignments: readonly { id: string; title: string }[]): string {
  const normalized = [...assignments]
    .map((a) => `${a.id}:${a.title}`)
    .sort()
    .join('|');
  return hashPayload(normalized);
}

function materialFingerprint(params: {
  readonly fileName: string;
  readonly extractedText: string | undefined;
  readonly assignmentHash: string;
}): string {
  return hashPayload(`${params.fileName}\0${params.extractedText ?? ''}\0${params.assignmentHash}`);
}

export async function runBatchMaterialMatching(params: {
  readonly database: Db;
  readonly userId: string;
  readonly llmClient?: LlmClient;
}): Promise<IBatchMaterialMatcherResult> {
  const cfg = resolveLlmConfig();
  const llm =
    params.llmClient ??
    (cfg ? new LlmClient({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model }) : null);
  if (!llm) {
    return { llmCallCount: 0, matchedCount: 0 };
  }

  const materialsColl = params.database.collection('slc_course_materials');

  const unmatched = await materialsColl
    .find({
      userId: params.userId,
      deletedAt: null,
      $or: [
        { 'record.assignmentExternalId': null },
        { 'record.assignmentExternalId': { $exists: false } },
      ],
    })
    .toArray();

  if (unmatched.length === 0) {
    return { llmCallCount: 0, matchedCount: 0 };
  }

  const assignmentsColl = params.database.collection('slc_assignments');
  const coursesColl = params.database.collection('slc_courses');

  const courseIds = [
    ...new Set(unmatched.map((m) => m['courseExternalId'] as string).filter(Boolean)),
  ];
  const courseDocs = await coursesColl
    .find({ userId: params.userId, externalId: { $in: courseIds } })
    .project({ externalId: 1, provider: 1, sourceId: 1, 'record.title': 1 })
    .toArray();
  const sourceCourses: ISourceCourse[] = courseDocs.map((c) => {
    const rec = (c['record'] as Record<string, unknown>) ?? {};
    return {
      externalId: c['externalId'] as string,
      sourceId: (c['sourceId'] as string) ?? '',
      provider: (c['provider'] as string) ?? '',
      title: (rec['title'] as string) ?? '',
    };
  });
  const mergedGroups = mergeCourses(sourceCourses);
  const extToMerged = new Map<string, string>();
  for (const g of mergedGroups) {
    for (const s of g.sources) {
      extToMerged.set(s.externalId, g.mergedId);
    }
  }

  const batchCourses: Array<{
    mergedCourseId: string;
    assignments: { id: string; title: string }[];
    files: { id: string; name: string; description?: string; fingerprint: string }[];
  }> = [];

  const byMerged = new Map<string, typeof unmatched>();
  for (const m of unmatched) {
    const cid = m['courseExternalId'] as string;
    const merged = extToMerged.get(cid) ?? cid;
    if (!byMerged.has(merged)) byMerged.set(merged, []);
    byMerged.get(merged)!.push(m);
  }

  for (const [mergedCourseId, materials] of byMerged) {
    const courseExtIds = [...new Set(materials.map((m) => m['courseExternalId'] as string))];
    const assignments = await assignmentsColl
      .find({
        userId: params.userId,
        deletedAt: null,
        courseExternalId: { $in: courseExtIds },
      })
      .project({ externalId: 1, 'record.title': 1 })
      .toArray();
    const assignmentList = assignments.map((a) => ({
      id: a['externalId'] as string,
      title: ((a['record'] as Record<string, unknown>)?.['title'] as string) ?? '',
    }));
    if (assignmentList.length === 0) continue;

    const assignHash = assignmentListHash(assignmentList);
    const files: { id: string; name: string; description?: string; fingerprint: string }[] = [];
    for (const m of materials) {
      const rec = m['record'] as Record<string, unknown>;
      const fileName = (rec?.['title'] as string) ?? (rec?.['fileName'] as string) ?? '';
      const extracted = rec?.['extractedText'] as string | undefined;
      const fingerprint = materialFingerprint({
        fileName,
        extractedText: extracted,
        assignmentHash: assignHash,
      });
      const prev = rec?.['matchFingerprint'] as string | undefined;
      if (prev === fingerprint) continue;
      const entry: { id: string; name: string; description?: string; fingerprint: string } = {
        id: m['externalId'] as string,
        name: fileName,
        fingerprint,
      };
      if (extracted) entry.description = extracted;
      files.push(entry);
    }
    if (files.length > 0) {
      batchCourses.push({ mergedCourseId, assignments: assignmentList, files });
    }
  }

  if (batchCourses.length === 0) {
    return { llmCallCount: 0, matchedCount: 0 };
  }

  const promptPayload = batchCourses.map((c) => ({
    courseId: c.mergedCourseId,
    assignments: c.assignments,
    files: c.files.map(({ fingerprint: _fp, ...rest }) => rest),
  }));

  let matchedCount = 0;
  try {
    const response = await llm.complete(
      [
        {
          role: 'user',
          content: `Match course files to assignments for multiple courses. Return a JSON array of { "fileId", "assignmentId", "confidence" } with confidence >= 0.7 only.\n\n${JSON.stringify(promptPayload)}`,
        },
      ],
      {
        maxTokens: 8192,
        system:
          'You are a school data matching assistant. Return ONLY a valid JSON array, no markdown fences.',
      }
    );
    const jsonStr = response.content
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
    const matches = JSON.parse(jsonStr) as Array<{
      fileId: string;
      assignmentId: string;
      confidence: number;
    }>;

    const fingerprintByFile = new Map<string, string>();
    for (const c of batchCourses) {
      for (const f of c.files) {
        fingerprintByFile.set(f.id, f.fingerprint);
      }
    }

    for (const m of matches) {
      if (m.confidence < 0.7) continue;
      const fp = fingerprintByFile.get(m.fileId);
      await materialsColl.updateOne(
        { userId: params.userId, externalId: m.fileId },
        {
          $set: {
            'record.assignmentExternalId': m.assignmentId,
            ...(fp ? { 'record.matchFingerprint': fp } : {}),
          },
        }
      );
      matchedCount += 1;
    }

    for (const c of batchCourses) {
      for (const f of c.files) {
        const wasMatched = matches.some((m) => m.fileId === f.id && m.confidence >= 0.7);
        if (!wasMatched) {
          await materialsColl.updateOne(
            { userId: params.userId, externalId: f.id },
            { $set: { 'record.matchFingerprint': f.fingerprint } }
          );
        }
      }
    }
  } catch {
    return { llmCallCount: 1, matchedCount: 0 };
  }

  return { llmCallCount: 1, matchedCount };
}
