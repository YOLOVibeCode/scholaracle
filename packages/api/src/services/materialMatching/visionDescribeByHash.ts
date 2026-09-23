import type { Db } from 'mongodb';
import type { IAssetStore } from '../assets/IAssetStore';
import { AssetRepository } from '../assets/AssetRepository';
import { LlmClient } from '@scholaracle/agents';
import { resolveLlmConfig } from '../llm/resolveLlmConfig';

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
const MAX_IMAGE_BYTES = 5_000_000;

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Describe each distinct contentHash once; reuse extractedText across materials. */
export async function runVisionDescribeByContentHash(params: {
  readonly database: Db;
  readonly userId: string;
  readonly assetStore: IAssetStore;
  readonly llmClient?: LlmClient;
}): Promise<{ readonly describeCallCount: number }> {
  const cfg = resolveLlmConfig();
  const llm =
    params.llmClient ??
    (cfg ? new LlmClient({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model }) : null);
  if (!llm) {
    return { describeCallCount: 0 };
  }

  const materialsColl = params.database.collection('slc_course_materials');
  const assetRepo = new AssetRepository(params.database);
  const pending = await materialsColl
    .find({
      userId: params.userId,
      deletedAt: null,
      $or: [
        { 'record.extractedText': null },
        { 'record.extractedText': { $exists: false } },
        { 'record.extractedText': '' },
      ],
    })
    .toArray();

  const byHash = new Map<string, typeof pending>();
  for (const doc of pending) {
    const rec = doc['record'] as Record<string, unknown>;
    const mime = (rec?.['mimeType'] as string | undefined)?.toLowerCase();
    if (!mime || !IMAGE_MIME_TYPES.includes(mime)) continue;
    const contentHash = rec?.['contentHash'] as string | undefined;
    if (!contentHash) continue;
    if (!byHash.has(contentHash)) byHash.set(contentHash, []);
    byHash.get(contentHash)!.push(doc);
  }

  let describeCallCount = 0;
  for (const [contentHash, docs] of byHash) {
    const sample = docs[0]!;
    const rec = sample['record'] as Record<string, unknown>;
    const assetId = rec?.['assetId'] as string | undefined;
    if (!assetId) continue;
    const asset = await assetRepo.findByAssetId(assetId);
    if (!asset?.storageKey) continue;

    try {
      const { stream, metadata } = await params.assetStore.get(asset.storageKey);
      if (metadata.contentLength > MAX_IMAGE_BYTES) continue;
      const buffer = await streamToBuffer(stream);
      if (buffer.byteLength > MAX_IMAGE_BYTES) continue;
      const base64 = buffer.toString('base64');
      const mediaType = (metadata.contentType || 'image/jpeg') as
        'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
      const fileName = (rec?.['fileName'] as string) ?? (rec?.['title'] as string) ?? 'unknown';

      const response = await llm.complete(
        [
          {
            role: 'user',
            content: `[Image base64 ${mediaType} len=${base64.length}] File: "${fileName}". Describe academic content in 1-3 sentences.\n${base64.slice(0, 200)}...`,
          },
        ],
        {
          maxTokens: 512,
          system: 'You describe school material images briefly for assignment matching.',
        }
      );
      describeCallCount += 1;
      const description = response.content.trim();
      if (!description) continue;

      await materialsColl.updateMany(
        { userId: params.userId, 'record.contentHash': contentHash },
        { $set: { 'record.extractedText': description } }
      );
    } catch {
      // best-effort
    }
  }

  return { describeCallCount };
}
