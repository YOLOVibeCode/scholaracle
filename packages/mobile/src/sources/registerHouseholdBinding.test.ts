import { registerHouseholdBinding } from './registerHouseholdBinding';
import type { IConnectedSource } from './ConnectedSourceStore';

const source: IConnectedSource = {
  provider: 'canvas',
  adapterId: 'canvas',
  baseUrl: 'https://school.example.com',
  sourceId: 'src-1',
  credentialKey: 'k',
  studentExternalId: 'stu-1',
  institutionExternalId: 'school.example.com',
  studentId: 'mongo-1',
  adapterVersion: '0.1.0',
};

describe('registerHouseholdBinding', () => {
  it('upserts portal account, binding, and ingest source', async () => {
    const upsertPortalAccount = jest.fn(async () => ({ portalAccountId: 'pa-1' }));
    const upsertPortalBinding = jest.fn(async () => undefined);
    const registerIngestSource = jest.fn(async () => undefined);
    const portalAccountId = await registerHouseholdBinding({
      source,
      displayName: 'Canvas',
      registrar: { upsertPortalAccount, upsertPortalBinding, registerIngestSource },
    });
    expect(portalAccountId).toBe('pa-1');
    expect(upsertPortalBinding).toHaveBeenCalledWith('pa-1', {
      studentId: 'mongo-1',
      sourceId: 'src-1',
      studentExternalId: 'stu-1',
    });
    expect(registerIngestSource).toHaveBeenCalled();
  });
});
