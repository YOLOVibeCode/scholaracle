import type { IConnectedSource } from './ConnectedSourceStore';
import {
  registerHouseholdBinding,
  type IHouseholdBindingRegistrar,
} from './registerHouseholdBinding';

const PROVIDER_LABELS: Record<IConnectedSource['provider'], string> = {
  canvas: 'Canvas',
  skyward: 'Skyward',
  aeries: 'Aeries',
};

export async function ensureBindingAfterSync(params: {
  readonly source: IConnectedSource;
  readonly registrar: IHouseholdBindingRegistrar;
}): Promise<string | undefined> {
  if (!params.source.studentId) {
    return params.source.portalAccountId;
  }
  const displayName = `${PROVIDER_LABELS[params.source.provider] ?? params.source.provider} (${params.source.institutionExternalId})`;
  try {
    return await registerHouseholdBinding({
      source: params.source,
      displayName,
      registrar: params.registrar,
    });
  } catch {
    return params.source.portalAccountId;
  }
}
