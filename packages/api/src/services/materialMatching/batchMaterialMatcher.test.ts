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

describe('runBatchMaterialMatching', () => {
  it('returns zero LLM calls when no unmatched materials exist', async () => {
    const complete = jest.fn();
    const llm = { complete } as unknown as LlmClient;
    const database = {
      collection: (name: string) => {
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
});
