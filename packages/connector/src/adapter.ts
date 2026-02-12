import type { ISlcIngestEnvelopeV1, ISlcCursor } from '@scholaracle/contracts';

/**
 * Adapter metadata — identifies the LMS provider and adapter version.
 */
export interface ILmsAdapterMeta {
  readonly provider: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly displayName: string;
}

/**
 * Credentials for authenticating with an LMS.
 */
export interface ILmsCredentials {
  readonly baseUrl: string;
  readonly accessToken?: string;
}

/**
 * Parameters for fetching an ingest envelope.
 */
export interface IFetchEnvelopeParams {
  readonly runId: string;
  readonly sourceId: string;
  readonly displayName: string;
  readonly portalBaseUrl?: string;
  readonly cursor?: ISlcCursor;
}

/**
 * ISP: Authentication concerns only.
 */
export interface ILmsAuthenticator {
  authenticate(credentials: ILmsCredentials): Promise<void>;
  isAuthenticated(): boolean;
}

/**
 * ISP: Data fetching concerns only.
 */
export interface ILmsEnvelopeReader {
  fetchEnvelope(params: IFetchEnvelopeParams): Promise<ISlcIngestEnvelopeV1>;
}

/**
 * Combined adapter interface.
 */
export interface ILmsAdapter extends ILmsAuthenticator, ILmsEnvelopeReader {
  readonly meta: ILmsAdapterMeta;
}

/**
 * Factory function that creates an adapter given credentials.
 */
export type LmsAdapterFactory = (credentials: ILmsCredentials) => ILmsAdapter;
