/**
 * Per-student local purge — mirrors the fullSignOut purge classes
 * (SecureStore credentials, source registry, run ledger) for ONE student.
 */

import * as SecureStore from 'expo-secure-store';
import { connectedSourceStore, type IConnectedSource } from '../sources/ConnectedSourceStore';
import { runLedger } from '../ledger/RunLedger';
import {
  purgeStudentLocalData,
  removeSourceLocally,
  sourceBelongsToStudent,
  type IStudentLocalDataDeps,
} from './studentLocalData';

function makeSource(overrides: Partial<IConnectedSource> = {}): IConnectedSource {
  return {
    provider: 'aeries',
    adapterId: 'aeries',
    baseUrl: 'https://portal.example.com',
    sourceId: 'local-aeries-portal.example.com-mongo-a',
    credentialKey: 'slc_creds_aeries_portal.example.com',
    studentExternalId: 'ext-a',
    institutionExternalId: 'portal.example.com',
    studentId: 'mongo-a',
    adapterVersion: '0.1.0',
    ...overrides,
  };
}

function makeDeps(sources: IConnectedSource[]): {
  deps: IStudentLocalDataDeps;
  calls: string[];
} {
  const calls: string[] = [];
  const state = [...sources];
  const deps: IStudentLocalDataDeps = {
    listSources: async () => [...state],
    removeSource: async (id) => {
      calls.push(`remove:${id}`);
      const idx = state.findIndex((s) => s.sourceId === id);
      if (idx >= 0) state.splice(idx, 1);
    },
    deleteCredential: async (key) => {
      calls.push(`cred:${key}`);
    },
    removeLedgerEntries: async (ids) => {
      calls.push(`ledger:${[...ids].sort().join(',')}`);
    },
  };
  return { deps, calls };
}

describe('sourceBelongsToStudent', () => {
  it('matches by Mongo id when the source has one', () => {
    expect(sourceBelongsToStudent(makeSource(), { id: 'mongo-a' })).toBe(true);
    expect(sourceBelongsToStudent(makeSource(), { id: 'mongo-b', studentId: 'ext-a' })).toBe(false);
  });

  it('falls back to the external id only for legacy rows without a Mongo id', () => {
    const legacy = makeSource({ studentId: undefined });
    expect(sourceBelongsToStudent(legacy, { id: 'mongo-a', studentId: 'ext-a' })).toBe(true);
    expect(sourceBelongsToStudent(legacy, { id: 'mongo-a' })).toBe(false);
    expect(sourceBelongsToStudent(legacy, { id: 'mongo-a', studentId: '' })).toBe(false);
  });
});

describe('purgeStudentLocalData', () => {
  it('removes the student rows, their credential and ledger entries', async () => {
    const { deps, calls } = makeDeps([makeSource()]);

    const result = await purgeStudentLocalData({ id: 'mongo-a', studentId: 'ext-a' }, deps);

    expect(calls).toEqual([
      'cred:slc_creds_aeries_portal.example.com',
      'remove:local-aeries-portal.example.com-mongo-a',
      'ledger:ext-a',
    ]);
    expect(result).toEqual({
      sourcesRemoved: 1,
      credentialsDeleted: 1,
      ledgerStudentIds: ['ext-a'],
    });
  });

  it('keeps a credential another student on the same portal still uses', async () => {
    const sibling = makeSource({
      sourceId: 'local-aeries-portal.example.com-mongo-b',
      studentExternalId: 'ext-b',
      studentId: 'mongo-b',
    });
    const { deps, calls } = makeDeps([makeSource(), sibling]);

    const result = await purgeStudentLocalData({ id: 'mongo-a', studentId: 'ext-a' }, deps);

    expect(calls).not.toContain('cred:slc_creds_aeries_portal.example.com');
    expect(calls).toContain('remove:local-aeries-portal.example.com-mongo-a');
    expect(calls).not.toContain('remove:local-aeries-portal.example.com-mongo-b');
    expect(result.credentialsDeleted).toBe(0);
  });

  it('deletes each distinct credential once when the student has several sources', async () => {
    const second = makeSource({
      sourceId: 'local-canvas-x-mongo-a',
      credentialKey: 'slc_creds_canvas_x',
      studentExternalId: 'ext-a',
    });
    const dup = makeSource({ sourceId: 'local-aeries-dup-mongo-a' });
    const { deps, calls } = makeDeps([makeSource(), second, dup]);

    const result = await purgeStudentLocalData({ id: 'mongo-a' }, deps);

    expect(calls.filter((c) => c.startsWith('cred:')).sort()).toEqual([
      'cred:slc_creds_aeries_portal.example.com',
      'cred:slc_creds_canvas_x',
    ]);
    expect(result.sourcesRemoved).toBe(3);
  });

  it('does nothing for a student with no local sources but still clears their ledger id', async () => {
    const other = makeSource({ studentId: 'mongo-z', studentExternalId: 'ext-z' });
    const { deps, calls } = makeDeps([other]);

    const result = await purgeStudentLocalData({ id: 'mongo-a', studentId: 'ext-a' }, deps);

    expect(result.sourcesRemoved).toBe(0);
    expect(calls).toEqual(['ledger:ext-a']);
  });

  it('skips the ledger when there is nothing to clear', async () => {
    const { deps, calls } = makeDeps([]);
    await purgeStudentLocalData({ id: 'mongo-a' }, deps);
    expect(calls).toEqual([]);
  });

  it('leaves ledger entries alone when a remaining source shares the external id', async () => {
    const shared = makeSource({
      sourceId: 'local-other',
      studentId: 'mongo-b',
      studentExternalId: 'ext-a',
      credentialKey: 'slc_creds_other',
    });
    const { deps, calls } = makeDeps([makeSource(), shared]);
    await purgeStudentLocalData({ id: 'mongo-a', studentId: 'ext-a' }, deps);
    expect(calls.some((c) => c.startsWith('ledger:'))).toBe(false);
  });

  it('keeps going when a credential or ledger step fails', async () => {
    const { deps, calls } = makeDeps([makeSource()]);
    const failing: IStudentLocalDataDeps = {
      ...deps,
      deleteCredential: async () => {
        throw new Error('keychain');
      },
      removeLedgerEntries: async () => {
        throw new Error('storage');
      },
    };
    const result = await purgeStudentLocalData({ id: 'mongo-a', studentId: 'ext-a' }, failing);
    expect(calls).toContain('remove:local-aeries-portal.example.com-mongo-a');
    expect(result.sourcesRemoved).toBe(1);
  });

  it('treats an unreadable registry as empty', async () => {
    const { deps } = makeDeps([]);
    const result = await purgeStudentLocalData(
      { id: 'mongo-a' },
      {
        ...deps,
        listSources: async () => {
          throw new Error('boom');
        },
      }
    );
    expect(result.sourcesRemoved).toBe(0);
  });
});

describe('removeSourceLocally', () => {
  it('deletes the credential when nothing else uses it', async () => {
    const source = makeSource();
    const { deps, calls } = makeDeps([source]);
    expect(await removeSourceLocally(source, deps)).toEqual({ credentialDeleted: true });
    expect(calls).toEqual([
      'cred:slc_creds_aeries_portal.example.com',
      'remove:local-aeries-portal.example.com-mongo-a',
    ]);
  });

  it('keeps a credential shared with another source', async () => {
    const source = makeSource();
    const sibling = makeSource({ sourceId: 'local-b', studentId: 'mongo-b' });
    const { deps, calls } = makeDeps([source, sibling]);
    expect(await removeSourceLocally(source, deps)).toEqual({ credentialDeleted: false });
    expect(calls).toEqual(['remove:local-aeries-portal.example.com-mongo-a']);
  });
});

describe('purgeStudentLocalData with the real stores', () => {
  it('purges registry, SecureStore credential and ledger for one student only', async () => {
    const a = makeSource();
    const b = makeSource({
      sourceId: 'local-canvas-y-mongo-b',
      credentialKey: 'slc_creds_canvas_y',
      studentExternalId: 'ext-b',
      studentId: 'mongo-b',
    });
    await connectedSourceStore.upsert(a);
    await connectedSourceStore.upsert(b);
    await runLedger.startRun({ runId: 'run-a', provider: 'aeries', studentExternalId: 'ext-a' });
    await runLedger.startRun({ runId: 'run-b', provider: 'canvas', studentExternalId: 'ext-b' });
    (SecureStore.deleteItemAsync as jest.Mock).mockClear();

    const result = await purgeStudentLocalData({ id: 'mongo-a', studentId: 'ext-a' });

    expect(result.sourcesRemoved).toBe(1);
    expect((await connectedSourceStore.list()).map((s) => s.sourceId)).toEqual([b.sourceId]);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(a.credentialKey);
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalledWith(b.credentialKey);
    expect((await runLedger.getAll()).map((e) => e.runId)).toEqual(['run-b']);

    await connectedSourceStore.remove(b.sourceId);
    await runLedger.clear();
  });
});
