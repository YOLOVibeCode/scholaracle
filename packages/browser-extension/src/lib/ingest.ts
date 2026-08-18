/**
 * Ingest uploader for the browser extension.
 *
 * Implements IIngestUploader from @scholaracle/scraper-core using the
 * three-step canonical protocol:
 *   POST /api/ingest/v1/runs
 *   POST /api/ingest/v1/runs/:runId/envelope
 *   POST /api/ingest/v1/runs/:runId/complete
 */

import type { ISlcIngestEnvelopeV1 } from '@scholaracle/contracts';
import type { IIngestUploader } from '@scholaracle/scraper-core';

export class ExtensionIngestUploader implements IIngestUploader {
  private readonly base: string;
  private readonly headers: Record<string, string>;

  constructor(apiBaseUrl: string, connectorToken: string) {
    this.base = apiBaseUrl.replace(/\/$/, '');
    this.headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${connectorToken}`,
    };
  }

  async upload(envelope: ISlcIngestEnvelopeV1): Promise<void> {
    const runId = envelope.run.runId;

    const runRes = await fetch(`${this.base}/api/ingest/v1/runs`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        runId,
        provider: envelope.run.provider,
        adapterId: envelope.run.adapterId,
        sourceId: envelope.source.sourceId,
        startedAt: envelope.run.startedAt,
      }),
    });
    if (!runRes.ok) throw new Error(`Run registration failed: ${runRes.status}`);

    const body = (await runRes.json()) as Partial<{ runId: string }>;
    const serverRunId = body.runId ?? runId;

    const envelopeRes = await fetch(`${this.base}/api/ingest/v1/runs/${serverRunId}/envelope`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ ...envelope, run: { ...envelope.run, runId: serverRunId } }),
    });
    if (!envelopeRes.ok) throw new Error(`Envelope upload failed: ${envelopeRes.status}`);

    const completeRes = await fetch(`${this.base}/api/ingest/v1/runs/${serverRunId}/complete`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ runId: serverRunId, status: 'success' }),
    });
    if (!completeRes.ok) throw new Error(`Run completion failed: ${completeRes.status}`);
  }

  async reportFailure(runId: string, sourceId: string, error: string): Promise<void> {
    try {
      const runRes = await fetch(`${this.base}/api/ingest/v1/runs`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ runId, sourceId }),
      });
      const body = runRes.ok ? ((await runRes.json()) as Partial<{ runId: string }>) : { runId };
      const serverRunId = body.runId ?? runId;
      await fetch(`${this.base}/api/ingest/v1/runs/${serverRunId}/complete`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ runId: serverRunId, status: 'failed', error }),
      });
    } catch {
      // best effort
    }
  }
}
