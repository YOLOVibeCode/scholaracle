/**
 * VisionAnalysisService — legacy single-material hook; uses LiteLLM via LlmClient and asset store bytes.
 */
import { type Db } from 'mongodb';
import { LlmClient } from '@scholaracle/agents';
import type { IAssetStore } from './assets/IAssetStore';
import { AssetRepository } from './assets/AssetRepository';
import { resolveLlmConfig } from './llm/resolveLlmConfig';

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
const MAX_IMAGE_BYTES = 5_000_000;

interface IVisionAnalysisParams {
  readonly database: Db;
  readonly collection: string;
  readonly filter: Record<string, unknown>;
  readonly mimeType: string | undefined;
  readonly storedUrl: string | undefined;
  readonly fileName: string | undefined;
  readonly assetId?: string;
  readonly assetStore?: IAssetStore;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function loadImageBase64FromAsset(params: {
  readonly database: Db;
  readonly assetId: string;
  readonly assetStore: IAssetStore;
}): Promise<string | undefined> {
  const assetRepo = new AssetRepository(params.database);
  const asset = await assetRepo.findByAssetId(params.assetId);
  if (!asset?.storageKey) return undefined;
  try {
    const { stream, metadata } = await params.assetStore.get(asset.storageKey);
    if (metadata.contentLength > MAX_IMAGE_BYTES) return undefined;
    const buffer = await streamToBuffer(stream);
    if (buffer.byteLength > MAX_IMAGE_BYTES) return undefined;
    return buffer.toString('base64');
  } catch {
    return undefined;
  }
}

/** Best-effort image description; never throws. */
export async function analyzeCourseMaterialImage(params: IVisionAnalysisParams): Promise<void> {
  const cfg = resolveLlmConfig();
  if (!cfg) return;

  const { mimeType, fileName, assetId, assetStore } = params;
  if (!mimeType || !IMAGE_MIME_TYPES.includes(mimeType.toLowerCase())) return;

  let base64: string | undefined;
  if (assetId && assetStore) {
    base64 = await loadImageBase64FromAsset({
      database: params.database,
      assetId,
      assetStore,
    });
  }

  if (!base64) return;

  const llm = new LlmClient({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model });
  try {
    const response = await llm.complete(
      [
        {
          role: 'user',
          content: `Describe this school material image ("${fileName ?? 'unknown'}") in 1-3 sentences.\n[base64 len=${base64.length}]`,
        },
      ],
      {
        maxTokens: 1024,
        system: 'You describe school material images briefly for parents and students.',
      }
    );
    const description = response.content.trim();
    if (!description) return;

    const coll = params.database.collection(params.collection);
    await coll.updateOne(params.filter, {
      $set: { 'record.extractedText': description },
    });
  } catch {
    // best-effort
  }
}

export function isAnalyzableImage(mimeType: string | undefined): boolean {
  if (!mimeType) return false;
  return IMAGE_MIME_TYPES.includes(mimeType.toLowerCase());
}
