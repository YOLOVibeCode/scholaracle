/**
 * VisionAnalysisService
 *
 * Analyzes image course materials using Claude's vision API to generate
 * extractedText descriptions. Runs server-side after ingest so no API keys
 * ship to client devices (mobile app, browser extension, CLI).
 *
 * Called after a courseMaterial upsert when:
 *   1. The material is an image (mimeType starts with 'image/')
 *   2. No extractedText exists yet
 *   3. A stored server-side URL is available (asset has been uploaded)
 *   4. ANTHROPIC_API_KEY env var is set
 */

import { type Db } from 'mongodb';

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
const MAX_IMAGE_BYTES = 5_000_000; // 5 MB Claude limit
const VISION_MODEL = 'claude-opus-4-5';

interface IVisionAnalysisParams {
  readonly database: Db;
  readonly collection: string;
  /** externalId key fields used to locate the document to update */
  readonly filter: Record<string, unknown>;
  readonly mimeType: string | undefined;
  /** Stored URL (on our asset server, accessible by the API process) */
  readonly storedUrl: string | undefined;
  readonly fileName: string | undefined;
}

/**
 * Analyze an image material and write extractedText back to the record.
 * Returns silently if conditions are not met — never throws.
 */
export async function analyzeCourseMaterialImage(params: IVisionAnalysisParams): Promise<void> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) return;

  const { mimeType, storedUrl, fileName } = params;
  if (!storedUrl) return;
  if (!mimeType || !IMAGE_MIME_TYPES.includes(mimeType.toLowerCase())) return;

  try {
    const response = await fetch(storedUrl);
    if (!response.ok) return;
    const contentLength = response.headers.get('content-length');
    if (contentLength && Number(contentLength) > MAX_IMAGE_BYTES) return;

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) return;

    const base64 = Buffer.from(buffer).toString('base64');
    const mediaType = mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: VISION_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: `This is a school course material file named "${fileName ?? 'unknown'}". Briefly describe what this image shows in 1-3 sentences, focusing on academic content relevant to students and teachers.`,
            },
          ],
        },
      ],
    });

    const block = message.content[0];
    const description = block && 'text' in block ? block.text.trim() : '';
    if (!description) return;

    const coll = params.database.collection(params.collection);
    await coll.updateOne(params.filter, {
      $set: { 'record.extractedText': description },
    });
  } catch {
    // Vision analysis is best-effort — never fail ingest
  }
}

/**
 * Returns true if the given mimeType is an image that qualifies for vision analysis.
 */
export function isAnalyzableImage(mimeType: string | undefined): boolean {
  if (!mimeType) return false;
  return IMAGE_MIME_TYPES.includes(mimeType.toLowerCase());
}
