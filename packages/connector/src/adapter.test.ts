import { SLC_INGEST_SCHEMA_VERSION_V1, type ISlcIngestEnvelopeV1 } from '@scholaracle/contracts';
import type {
  ILmsAdapter,
  ILmsAdapterMeta,
  ILmsCredentials,
  IFetchEnvelopeParams,
} from './adapter';

/** Test double that implements ILmsAdapter */
class TestAdapter implements ILmsAdapter {
  public readonly meta: ILmsAdapterMeta = {
    provider: 'test',
    adapterId: 'com.test.adapter',
    adapterVersion: '1.0.0',
    displayName: 'Test Adapter',
  };

  private _authenticated = false;

  public async authenticate(_credentials: ILmsCredentials): Promise<void> {
    this._authenticated = true;
  }

  public isAuthenticated(): boolean {
    return this._authenticated;
  }

  public async fetchEnvelope(params: IFetchEnvelopeParams): Promise<ISlcIngestEnvelopeV1> {
    const now = new Date().toISOString();
    return {
      schemaVersion: SLC_INGEST_SCHEMA_VERSION_V1,
      run: {
        runId: params.runId,
        startedAt: now,
        provider: this.meta.provider,
        adapterId: this.meta.adapterId,
        adapterVersion: this.meta.adapterVersion,
        mode: 'delta',
        timezone: 'UTC',
      },
      source: {
        sourceId: params.sourceId,
        displayName: params.displayName,
        portalBaseUrl: params.portalBaseUrl,
      },
      ops: [],
    };
  }
}

describe('ILmsAdapter contract', () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    adapter = new TestAdapter();
  });

  it('should expose meta with provider and adapterId', () => {
    expect(adapter.meta.provider).toBe('test');
    expect(adapter.meta.adapterId).toBe('com.test.adapter');
    expect(adapter.meta.adapterVersion).toBe('1.0.0');
    expect(adapter.meta.displayName).toBe('Test Adapter');
  });

  it('should report not authenticated before authenticate()', () => {
    expect(adapter.isAuthenticated()).toBe(false);
  });

  it('should report authenticated after authenticate()', async () => {
    await adapter.authenticate({ baseUrl: 'https://example.com' });
    expect(adapter.isAuthenticated()).toBe(true);
  });

  it('should return a valid envelope from fetchEnvelope()', async () => {
    const envelope = await adapter.fetchEnvelope({
      runId: 'run-1',
      sourceId: 'source-1',
      displayName: 'Test Source',
    });

    expect(envelope.schemaVersion).toBe(SLC_INGEST_SCHEMA_VERSION_V1);
    expect(envelope.run.runId).toBe('run-1');
    expect(envelope.run.provider).toBe('test');
    expect(envelope.run.mode).toBe('delta');
    expect(envelope.source.sourceId).toBe('source-1');
    expect(envelope.source.displayName).toBe('Test Source');
    expect(Array.isArray(envelope.ops)).toBe(true);
  });
});
