import { SLC_INGEST_SCHEMA_VERSION_V1 } from '@scholaracle/contracts';
import { buildFixtureEnvelope } from './fixture-adapter';

describe('buildFixtureEnvelope', () => {
  const baseParams = {
    runId: 'run-123',
    sourceId: 'src-456',
    displayName: 'Test Source',
  };

  it('returns envelope with correct schema version', () => {
    const envelope = buildFixtureEnvelope(baseParams);

    expect(envelope.schemaVersion).toBe(SLC_INGEST_SCHEMA_VERSION_V1);
    expect(envelope.schemaVersion).toBe('slc.ingest.v1');
  });

  it('uses provided params in run and source fields', () => {
    const envelope = buildFixtureEnvelope({
      ...baseParams,
      portalBaseUrl: 'https://portal.example.com',
    });

    expect(envelope.run.runId).toBe('run-123');
    expect(envelope.run.provider).toBe('fixture');
    expect(envelope.run.adapterId).toBe('com.scholaracle.fixture');
    expect(envelope.run.mode).toBe('delta');
    expect(envelope.run.timezone).toBe('America/Los_Angeles');
    expect(envelope.source.sourceId).toBe('src-456');
    expect(envelope.source.displayName).toBe('Test Source');
    expect(envelope.source.portalBaseUrl).toBe('https://portal.example.com');
  });

  it('includes two ops with correct entity types', () => {
    const envelope = buildFixtureEnvelope(baseParams);

    expect(envelope.ops).toHaveLength(2);

    const [firstOp, secondOp] = envelope.ops;
    expect(firstOp!.op).toBe('upsert');
    expect(firstOp!.entity).toBe('assignment');
    expect(secondOp!.op).toBe('upsert');
    expect(secondOp!.entity).toBe('eventSeries');
  });

  it('includes portalBaseUrl in source when provided', () => {
    const withPortal = buildFixtureEnvelope({
      ...baseParams,
      portalBaseUrl: 'https://canvas.university.edu',
    });

    expect(withPortal.source.portalBaseUrl).toBe('https://canvas.university.edu');

    const withoutPortal = buildFixtureEnvelope(baseParams);
    expect(withoutPortal.source.portalBaseUrl).toBeUndefined();
  });
});
