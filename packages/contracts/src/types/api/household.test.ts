import {
  INGEST_MISSING_BINDING_CODE,
  type IPortalAccountUpsertRequest,
  type IPortalBindingUpsertRequest,
  type ISlcBinding,
  type ISlcPortalAccount,
} from './household';

describe('household wire types', () => {
  it('defines MISSING_BINDING ingest code', () => {
    expect(INGEST_MISSING_BINDING_CODE).toBe('MISSING_BINDING');
  });

  it('accepts portal account upsert shape', () => {
    const req: IPortalAccountUpsertRequest = {
      provider: 'canvas',
      adapterId: 'canvas',
      portalBaseUrl: 'https://school.instructure.com',
      institutionExternalId: 'school.instructure.com',
      displayName: 'Canvas (school.instructure.com)',
    };
    expect(req.provider).toBe('canvas');
  });

  it('accepts binding upsert shape', () => {
    const req: IPortalBindingUpsertRequest = {
      studentId: '507f1f77bcf86cd799439011',
      sourceId: 'local-canvas-x-stu1',
      studentExternalId: 'stu-emma',
    };
    const account: ISlcPortalAccount = {
      portalAccountId: 'pa-1',
      provider: 'canvas',
      adapterId: 'canvas',
      portalBaseUrl: 'https://x.com',
      institutionExternalId: 'x.com',
      displayName: 'Canvas',
    };
    const binding: ISlcBinding = { ...req, portalAccountId: account.portalAccountId };
    expect(binding.studentExternalId).toBe('stu-emma');
  });
});
