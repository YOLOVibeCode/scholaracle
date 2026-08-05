/**
 * Three-step ingest upload (runs → envelope → complete) for the extension.
 * Mirrors the pattern used in the mobile SyncOrchestrator.
 */

import type { ISlcIngestEnvelopeV1 } from '@scholaracle/contracts';

export async function uploadEnvelope(
  envelope: ISlcIngestEnvelopeV1,
  connectorToken: string,
  apiBaseUrl: string
): Promise<void> {
  const base = apiBaseUrl.replace(/\/$/, '');
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${connectorToken}`,
  };

  const runRes = await fetch(`${base}/api/ingest/v1/runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      runId: envelope.run.runId,
      provider: envelope.run.provider,
      adapterId: envelope.run.adapterId,
      sourceId: envelope.source.sourceId,
      startedAt: envelope.run.startedAt,
    }),
  });
  if (!runRes.ok) throw new Error(`Run registration failed: ${runRes.status}`);

  const envelopeRes = await fetch(`${base}/api/ingest/v1/envelope`, {
    method: 'POST',
    headers,
    body: JSON.stringify(envelope),
  });
  if (!envelopeRes.ok) throw new Error(`Envelope upload failed: ${envelopeRes.status}`);

  const completeRes = await fetch(`${base}/api/ingest/v1/complete`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ runId: envelope.run.runId, status: 'success' }),
  });
  if (!completeRes.ok) throw new Error(`Run completion failed: ${completeRes.status}`);
}
