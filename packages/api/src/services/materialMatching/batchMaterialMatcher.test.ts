import { runBatchMaterialMatching } from './batchMaterialMatcher';
import { LlmClient } from '@scholaracle/agents';
import { createHash } from 'node:crypto';

function hashPayload(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function expectedMatchFingerprint(): string {
  const assignHash = hashPayload('asg-1:HW 1');
  return hashPayload(`Homework.pdf\0fractions\0${assignHash}`);
}

function mockConsentsCollection(userId: string, opts?: { active?: boolean }) {
  const isActive = opts?.active ?? true;
  return {
    findOne: async (query: { userId: string; purpose: string }) => {
      if (!isActive || query.userId !== userId) {
        return null;
      }
      return { userId, purpose: query.purpose, consentedAt: new Date() };
    },
  };
}

describe('runBatchMaterialMatching', () => {
  it('returns zero LLM calls when no unmatched materials exist', async () => {
    const complete = jest.fn();
    const llm = { complete } as unknown as LlmClient;
    const database = {
      collection: (name: string) => {
        if (name === 'consents') {
          return mockConsentsCollection('user-1');
        }
        if (name === 'slc_course_materials') {
          return {
            find: () => ({
              toArray: async () => [],
            }),
          };
        }
        throw new Error(`unexpected ${name}`);
      },
    };

    const result = await runBatchMaterialMatching({
      database: database as never,
      userId: 'user-1',
      llmClient: llm,
    });
    expect(complete).not.toHaveBeenCalled();
    expect(result.llmCallCount).toBe(0);
  });

  it('issues one batched LLM call for unmatched materials across courses', async () => {
    const complete = jest.fn().mockResolvedValue({
      content: JSON.stringify([{ fileId: 'mat-1', assignmentId: 'asg-1', confidence: 0.9 }]),
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const llm = { complete } as unknown as LlmClient;

    const materials = [
      {
        externalId: 'mat-1',
        userId: 'user-1',
        courseExternalId: 'course-1',
        record: { title: 'Homework.pdf', extractedText: 'fractions' },
      },
    ];
    const courses = [
      {
        externalId: 'course-1',
        userId: 'user-1',
        provider: 'skyward',
        sourceId: 'src-1',
        record: { title: 'Algebra 1' },
      },
    ];
    const assignments = [
      {
        externalId: 'asg-1',
        userId: 'user-1',
        courseExternalId: 'course-1',
        record: { title: 'HW 1' },
      },
    ];

    const updateOne = jest.fn().mockResolvedValue({});
    const database = {
      collection: (name: string) => {
        if (name === 'consents') {
          return mockConsentsCollection('user-1');
        }
        if (name === 'slc_course_materials') {
          return {
            find: () => ({
              toArray: async () => materials,
            }),
            updateOne,
          };
        }
        if (name === 'slc_courses') {
          return {
            find: () => ({
              project: () => ({
                toArray: async () => courses,
              }),
            }),
          };
        }
        if (name === 'slc_assignments') {
          return {
            find: () => ({
              project: () => ({
                toArray: async () => assignments,
              }),
            }),
          };
        }
        throw new Error(`unexpected ${name}`);
      },
    };

    const result = await runBatchMaterialMatching({
      database: database as never,
      userId: 'user-1',
      llmClient: llm,
    });

    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.llmCallCount).toBe(1);
    expect(result.matchedCount).toBe(1);
  });

  it('skips LLM when matchFingerprint is unchanged for all materials', async () => {
    const complete = jest.fn();
    const llm = { complete } as unknown as LlmClient;

    const fingerprint = expectedMatchFingerprint();

    const materials = [
      {
        externalId: 'mat-1',
        userId: 'user-1',
        courseExternalId: 'course-1',
        record: {
          title: 'Homework.pdf',
          extractedText: 'fractions',
          matchFingerprint: fingerprint,
        },
      },
    ];
    const courses = [
      {
        externalId: 'course-1',
        userId: 'user-1',
        provider: 'skyward',
        sourceId: 'src-1',
        record: { title: 'Algebra 1' },
      },
    ];
    const assignments = [
      {
        externalId: 'asg-1',
        userId: 'user-1',
        courseExternalId: 'course-1',
        record: { title: 'HW 1' },
      },
    ];

    const database = {
      collection: (name: string) => {
        if (name === 'consents') {
          return mockConsentsCollection('user-1');
        }
        if (name === 'slc_course_materials') {
          return {
            find: () => ({
              toArray: async () => materials,
            }),
            updateOne: jest.fn(),
          };
        }
        if (name === 'slc_courses') {
          return {
            find: () => ({
              project: () => ({
                toArray: async () => courses,
              }),
            }),
          };
        }
        if (name === 'slc_assignments') {
          return {
            find: () => ({
              project: () => ({
                toArray: async () => assignments,
              }),
            }),
          };
        }
        throw new Error(`unexpected ${name}`);
      },
    };

    const result = await runBatchMaterialMatching({
      database: database as never,
      userId: 'user-1',
      llmClient: llm,
    });

    expect(complete).not.toHaveBeenCalled();
    expect(result.llmCallCount).toBe(0);
  });

  it("offers each student's files only that student's assignments when siblings share a class name", async () => {
    const complete = jest.fn().mockResolvedValue({
      content: '[]',
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const llm = { complete } as unknown as LlmClient;

    const materials = [
      {
        externalId: 'mat-a',
        userId: 'user-1',
        studentExternalId: 'stu-a',
        courseExternalId: 'course-a',
        record: { title: 'Glaze notes.pdf' },
      },
      {
        externalId: 'mat-b',
        userId: 'user-1',
        studentExternalId: 'stu-b',
        courseExternalId: 'course-b',
        record: { title: 'Kiln log.pdf' },
      },
    ];
    const courses = [
      {
        externalId: 'course-a',
        userId: 'user-1',
        studentExternalId: 'stu-a',
        provider: 'canvas',
        sourceId: 'src-a',
        record: { title: 'Pottery' },
      },
      {
        externalId: 'course-b',
        userId: 'user-1',
        studentExternalId: 'stu-b',
        provider: 'canvas',
        sourceId: 'src-b',
        record: { title: 'Pottery' },
      },
    ];
    const assignments = [
      {
        externalId: 'asg-a',
        userId: 'user-1',
        studentExternalId: 'stu-a',
        courseExternalId: 'course-a',
        record: { title: 'Glaze test' },
      },
      {
        externalId: 'asg-b',
        userId: 'user-1',
        studentExternalId: 'stu-b',
        courseExternalId: 'course-b',
        record: { title: 'Kiln firing' },
      },
    ];
    const matchesFilter = (doc: Record<string, unknown>, filter: Record<string, unknown>) =>
      Object.entries(filter).every(([field, want]) => {
        if (field === 'deletedAt') return true;
        if (want != null && typeof want === 'object' && '$in' in want) {
          return (want as { $in: unknown[] }).$in.includes(doc[field]);
        }
        return doc[field] === want;
      });

    const database = {
      collection: (name: string) => {
        if (name === 'consents') {
          return mockConsentsCollection('user-1');
        }
        if (name === 'slc_course_materials') {
          return {
            find: () => ({ toArray: async () => materials }),
            updateOne: jest.fn().mockResolvedValue({}),
          };
        }
        const docs: Record<string, unknown>[] | undefined =
          name === 'slc_courses' ? courses : name === 'slc_assignments' ? assignments : undefined;
        if (docs) {
          return {
            find: (filter: Record<string, unknown>) => ({
              project: () => ({
                toArray: async () => docs.filter((d) => matchesFilter(d, filter)),
              }),
            }),
          };
        }
        throw new Error(`unexpected ${name}`);
      },
    };

    await runBatchMaterialMatching({
      database: database as never,
      userId: 'user-1',
      llmClient: llm,
    });

    expect(complete).toHaveBeenCalledTimes(1);
    const prompt = (complete.mock.calls[0]![0] as Array<{ content: string }>)[0]!.content;
    const payload = JSON.parse(prompt.slice(prompt.indexOf('['))) as Array<{
      assignments: Array<{ id: string }>;
      files: Array<{ id: string }>;
    }>;
    const offered = payload.map((c) => ({
      files: c.files.map((f) => f.id),
      assignments: c.assignments.map((a) => a.id),
    }));
    expect(offered).toEqual(
      expect.arrayContaining([
        { files: ['mat-a'], assignments: ['asg-a'] },
        { files: ['mat-b'], assignments: ['asg-b'] },
      ])
    );
    expect(offered).toHaveLength(2);
  });

  it('skips LLM when server AI consent is off', async () => {
    const complete = jest.fn();
    const llm = { complete } as unknown as LlmClient;
    const materials = [
      {
        externalId: 'mat-1',
        userId: 'user-1',
        courseExternalId: 'course-1',
        record: { title: 'Homework.pdf', extractedText: 'fractions' },
      },
    ];
    const database = {
      collection: (name: string) => {
        if (name === 'consents') {
          return mockConsentsCollection('user-1', { active: false });
        }
        if (name === 'slc_course_materials') {
          return {
            find: () => ({
              toArray: async () => materials,
            }),
          };
        }
        throw new Error(`unexpected ${name}`);
      },
    };

    const result = await runBatchMaterialMatching({
      database: database as never,
      userId: 'user-1',
      llmClient: llm,
    });
    expect(complete).not.toHaveBeenCalled();
    expect(result.llmCallCount).toBe(0);
  });
});
