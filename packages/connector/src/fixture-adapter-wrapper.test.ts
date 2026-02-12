import { SLC_INGEST_SCHEMA_VERSION_V1 } from '@scholaracle/contracts';
import { FixtureAdapter } from './fixture-adapter-wrapper';

describe('FixtureAdapter', () => {
  let adapter: FixtureAdapter;

  beforeEach(() => {
    adapter = new FixtureAdapter();
  });

  it('should have correct meta', () => {
    expect(adapter.meta.provider).toBe('fixture');
    expect(adapter.meta.adapterId).toBe('com.scholaracle.fixture');
    expect(adapter.meta.adapterVersion).toBe('0.1.0');
    expect(adapter.meta.displayName).toBe('Fixture Data');
  });

  it('should always report authenticated', () => {
    expect(adapter.isAuthenticated()).toBe(true);
  });

  it('should complete authenticate without error', async () => {
    await expect(adapter.authenticate({ baseUrl: '' })).resolves.toBeUndefined();
  });

  it('should return a valid fixture envelope', async () => {
    const envelope = await adapter.fetchEnvelope({
      runId: 'run-1',
      sourceId: 'src-1',
      displayName: 'Test Fixture',
      portalBaseUrl: 'https://example.com',
    });

    expect(envelope.schemaVersion).toBe(SLC_INGEST_SCHEMA_VERSION_V1);
    expect(envelope.run.runId).toBe('run-1');
    expect(envelope.run.provider).toBe('fixture');
    expect(envelope.run.adapterId).toBe('com.scholaracle.fixture');
    expect(envelope.source.sourceId).toBe('src-1');
    expect(envelope.source.displayName).toBe('Test Fixture');
    expect(envelope.source.portalBaseUrl).toBe('https://example.com');
    expect(envelope.ops.length).toBeGreaterThan(0);
  });
});
