import type {
  IPortalAccountUpsertRequest,
  IPortalBindingUpsertRequest,
} from '@scholaracle/contracts';
import type { IConnectedSource } from './ConnectedSourceStore';

export interface IHouseholdBindingRegistrar {
  upsertPortalAccount(body: IPortalAccountUpsertRequest): Promise<{ portalAccountId: string }>;
  upsertPortalBinding(portalAccountId: string, body: IPortalBindingUpsertRequest): Promise<void>;
  registerIngestSource(source: {
    readonly sourceId: string;
    readonly provider: string;
    readonly adapterId: string;
    readonly displayName: string;
    readonly portalBaseUrl?: string;
  }): Promise<void>;
}

export async function registerHouseholdBinding(params: {
  readonly source: IConnectedSource;
  readonly displayName: string;
  readonly registrar: IHouseholdBindingRegistrar;
}): Promise<string> {
  const account = await params.registrar.upsertPortalAccount({
    provider: params.source.provider,
    adapterId: params.source.adapterId,
    portalBaseUrl: params.source.baseUrl,
    institutionExternalId: params.source.institutionExternalId,
    displayName: params.displayName,
  });
  const studentId = params.source.studentId;
  if (!studentId) {
    throw new Error('Student id is required to register a binding');
  }
  await params.registrar.upsertPortalBinding(account.portalAccountId, {
    studentId,
    sourceId: params.source.sourceId,
    studentExternalId: params.source.studentExternalId,
  });
  await params.registrar.registerIngestSource({
    sourceId: params.source.sourceId,
    provider: params.source.provider,
    adapterId: params.source.adapterId,
    displayName: params.displayName,
    portalBaseUrl: params.source.baseUrl,
  });
  return account.portalAccountId;
}
