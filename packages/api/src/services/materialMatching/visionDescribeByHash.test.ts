import { runVisionDescribeByContentHash } from './visionDescribeByHash';
import { LlmClient } from '@scholaracle/agents';
import type { IAssetStore } from '../assets/IAssetStore';
import { Readable } from 'node:stream';

describe('runVisionDescribeByContentHash', () => {
  it('calls LLM once per distinct contentHash and updates all matching materials', async () => {
    const complete = jest.fn().mockResolvedValue({
      content: 'A worksheet about fractions.',
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const llm = { complete } as unknown as LlmClient;

    const materials = [
      {
        externalId: 'mat-1',
        userId: 'user-1',
        record: {
          mimeType: 'image/png',
          contentHash: 'hash-abc',
          assetId: 'asset-1',
          fileName: 'sheet-a.png',
        },
      },
      {
        externalId: 'mat-2',
        userId: 'user-1',
        record: {
          mimeType: 'image/png',
          contentHash: 'hash-abc',
          assetId: 'asset-1',
          fileName: 'sheet-b.png',
        },
      },
    ];

    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 2 });
    const database = {
      collection: (name: string) => {
        if (name === 'slc_course_materials') {
          return {
            find: () => ({
              toArray: async () => materials,
            }),
            updateMany,
          };
        }
        if (name === 'slc_assets') {
          return {
            findOne: async () => ({
              assetId: 'asset-1',
              storageKey: 'key-1',
            }),
          };
        }
        throw new Error(`unexpected ${name}`);
      },
    };

    const assetStore: IAssetStore = {
      put: jest.fn(),
      get: jest.fn().mockResolvedValue({
        stream: Readable.from([Buffer.from('fake-png')]),
        metadata: { contentType: 'image/png', contentLength: 8 },
      }),
      delete: jest.fn(),
      exists: jest.fn(),
      getSignedUrl: jest.fn(),
    };

    const result = await runVisionDescribeByContentHash({
      database: database as never,
      userId: 'user-1',
      assetStore,
      llmClient: llm,
    });

    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.describeCallCount).toBe(1);
    expect(updateMany).toHaveBeenCalledWith(
      { userId: 'user-1', 'record.contentHash': 'hash-abc' },
      { $set: { 'record.extractedText': 'A worksheet about fractions.' } }
    );
  });
});
