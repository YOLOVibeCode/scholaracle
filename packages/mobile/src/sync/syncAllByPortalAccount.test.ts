import type { IConnectedSource } from '../sources/ConnectedSourceStore';
import {
  groupSourcesByPortalAccount,
  portalAccountGroupKey,
  runSerializedSameHostSyncs,
} from './syncAllByPortalAccount';

function makeSource(overrides: Partial<IConnectedSource>): IConnectedSource {
  return {
    provider: 'canvas',
    adapterId: 'canvas',
    baseUrl: 'https://school.example.com',
    sourceId: 'src-1',
    credentialKey: 'slc_creds_canvas_school.example.com',
    studentExternalId: 'stu-1',
    institutionExternalId: 'school.example.com',
    adapterVersion: '0.1.0',
    ...overrides,
  };
}

describe('syncAllByPortalAccount', () => {
  it('groups sources by portal account or credential key', () => {
    const a = makeSource({ sourceId: 'a', portalAccountId: 'pa-1', credentialKey: 'k1' });
    const b = makeSource({ sourceId: 'b', portalAccountId: 'pa-1', credentialKey: 'k1' });
    const c = makeSource({ sourceId: 'c', credentialKey: 'k2' });
    const groups = groupSourcesByPortalAccount([a, b, c]);
    expect(groups.get('pa-1')).toHaveLength(2);
    expect(groups.get('k2')).toHaveLength(1);
    expect(portalAccountGroupKey(a)).toBe('pa-1');
    expect(portalAccountGroupKey(c)).toBe('k2');
  });

  it('runs same-host syncs serially without overlapping', async () => {
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;
    await runSerializedSameHostSyncs(
      ['a', 'b'].map((label) => async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        order.push(`start-${label}`);
        await Promise.resolve();
        order.push(`end-${label}`);
        active -= 1;
      })
    );
    expect(maxActive).toBe(1);
    expect(order).toEqual(['start-a', 'end-a', 'start-b', 'end-b']);
  });
});
