import type { IConnectedSource } from './ConnectedSourceStore';
import { ensureBindingAfterSync } from './ensureBindingAfterSync';

function makeSource(overrides?: Partial<IConnectedSource>): IConnectedSource {
  return {
    provider: 'canvas',
    adapterId: 'canvas',
    baseUrl: 'https://school.example.com',
    sourceId: 'src-existing',
    credentialKey: 'cred-1',
    studentExternalId: 'ext-1',
    institutionExternalId: 'school.example.com',
    studentId: '507f1f77bcf86cd799439011',
    adapterVersion: '0.1.0',
    ...overrides,
  };
}

describe('ensureBindingAfterSync', () => {
  it('registers a binding after a successful sync of an existing source', async () => {
    const upsertPortalAccount = jest.fn(async () => ({ portalAccountId: 'pa-existing' }));
    const upsertPortalBinding = jest.fn(async () => undefined);
    const registerIngestSource = jest.fn(async () => undefined);

    const portalAccountId = await ensureBindingAfterSync({
      source: makeSource(),
      registrar: { upsertPortalAccount, upsertPortalBinding, registerIngestSource },
    });

    expect(portalAccountId).toBe('pa-existing');
    expect(upsertPortalBinding).toHaveBeenCalledWith('pa-existing', {
      studentId: '507f1f77bcf86cd799439011',
      sourceId: 'src-existing',
      studentExternalId: 'ext-1',
    });
    expect(registerIngestSource).toHaveBeenCalled();
  });

  it('no-ops when studentId is missing', async () => {
    const upsertPortalBinding = jest.fn(async () => undefined);
    await ensureBindingAfterSync({
      source: makeSource({ studentId: undefined, portalAccountId: 'pa-keep' }),
      registrar: {
        upsertPortalAccount: jest.fn(),
        upsertPortalBinding,
        registerIngestSource: jest.fn(),
      },
    });
    expect(upsertPortalBinding).not.toHaveBeenCalled();
  });
});
