import type { ISlcIngestEnvelopeV1 } from '@scholaracle/contracts';
import type {
  ILmsAdapter,
  ILmsAdapterMeta,
  ILmsCredentials,
  IFetchEnvelopeParams,
} from './adapter';
import { buildFixtureEnvelope } from './fixture-adapter';

/**
 * Wraps the existing buildFixtureEnvelope function as an ILmsAdapter
 * so it works through the adapter registry.
 */
export class FixtureAdapter implements ILmsAdapter {
  public readonly meta: ILmsAdapterMeta = {
    provider: 'fixture',
    adapterId: 'com.scholaracle.fixture',
    adapterVersion: '0.1.0',
    displayName: 'Fixture Data',
  };

  public async authenticate(_credentials: ILmsCredentials): Promise<void> {
    // Fixture adapter requires no authentication
  }

  public isAuthenticated(): boolean {
    return true;
  }

  public async fetchEnvelope(params: IFetchEnvelopeParams): Promise<ISlcIngestEnvelopeV1> {
    return buildFixtureEnvelope({
      runId: params.runId,
      sourceId: params.sourceId,
      displayName: params.displayName,
      portalBaseUrl: params.portalBaseUrl,
    });
  }
}
