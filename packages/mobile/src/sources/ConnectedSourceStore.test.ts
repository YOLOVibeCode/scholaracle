/**
 * ConnectedSourceStore tests (TDD).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ConnectedSourceStore,
  buildCredentialKey,
  sourceIdForStudent,
  type IConnectedSource,
} from './ConnectedSourceStore';

function makeSource(overrides?: Partial<IConnectedSource>): IConnectedSource {
  return {
    provider: 'canvas',
    adapterId: 'com.instructure.canvas',
    baseUrl: 'https://school.instructure.com',
    sourceId: 'src-1',
    credentialKey: 'slc_creds_canvas_school.instructure.com',
    studentExternalId: 'stu-1',
    institutionExternalId: 'school.instructure.com',
    adapterVersion: '0.1.0',
    ...overrides,
  };
}

describe('ConnectedSourceStore', () => {
  let store: ConnectedSourceStore;

  beforeEach(async () => {
    await AsyncStorage.clear();
    store = new ConnectedSourceStore();
  });

  it('should start empty', async () => {
    expect(await store.list()).toEqual([]);
  });

  it('should upsert and list sources', async () => {
    await store.upsert(makeSource());
    expect(await store.list()).toHaveLength(1);
    expect((await store.list())[0]?.sourceId).toBe('src-1');
  });

  it('should replace on upsert same sourceId', async () => {
    await store.upsert(makeSource());
    await store.upsert(makeSource({ baseUrl: 'https://other.instructure.com' }));
    const all = await store.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.baseUrl).toBe('https://other.instructure.com');
  });

  it('should getForStudent by external id', async () => {
    await store.upsert(makeSource({ studentExternalId: 'stu-a', sourceId: 'a' }));
    await store.upsert(makeSource({ studentExternalId: 'stu-b', sourceId: 'b' }));
    const found = await store.getForStudent('stu-b');
    expect(found?.sourceId).toBe('b');
  });

  it('should match a household student by mongo id when SIS id is not set yet', async () => {
    await store.upsert(
      makeSource({
        sourceId: 'local-skyward-host-mongo-g',
        studentId: 'mongo-g',
        studentExternalId: 'mongo-g',
      })
    );
    const found = await store.getForStudentRecord({ id: 'mongo-g' });
    expect(found?.sourceId).toBe('local-skyward-host-mongo-g');
  });

  it('should build a per-student source id so two kids sharing a portal do not clobber', () => {
    const a = sourceIdForStudent('skyward', 'skyward.iscorp.com', 'mongo-g');
    const b = sourceIdForStudent('skyward', 'skyward.iscorp.com', 'mongo-c');
    expect(a).not.toBe(b);
    expect(a).toContain('mongo-g');
  });

  it('should return null for an unknown student instead of falling back to another source', async () => {
    // Regression: the old `?? all[0]` fallback silently synced the WRONG
    // student's portal when no source matched.
    await store.upsert(makeSource({ studentExternalId: 'stu-a', sourceId: 'a' }));
    const found = await store.getForStudent('stu-unknown');
    expect(found).toBeNull();
  });

  it('should remove by sourceId', async () => {
    await store.upsert(makeSource());
    await store.remove('src-1');
    expect(await store.list()).toEqual([]);
  });

  it('should build credential keys without secrets', () => {
    expect(buildCredentialKey('canvas', 'https://x.com/')).toBe('slc_creds_canvas_x.com');
  });
});
