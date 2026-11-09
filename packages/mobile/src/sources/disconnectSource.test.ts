import { ApiError } from '../api/ApiError';
import type { IConnectedSource } from './ConnectedSourceStore';
import type { IStudentLocalDataDeps } from '../students/studentLocalData';
import {
  DISCONNECT_LOCAL_LABEL,
  DISCONNECT_SERVER_LABEL,
  DisconnectError,
  canDisconnectOnServer,
  disconnectConfirmText,
  disconnectFailureMessage,
  disconnectSource,
  type IDisconnectDeps,
} from './disconnectSource';

function makeSource(overrides: Partial<IConnectedSource> = {}): IConnectedSource {
  return {
    provider: 'canvas',
    adapterId: 'canvas',
    baseUrl: 'https://school.example.com',
    sourceId: 'local-canvas-school-m1',
    credentialKey: 'slc_creds_canvas_school.example.com',
    studentExternalId: 'ext-1',
    institutionExternalId: 'school.example.com',
    studentId: 'm1',
    adapterVersion: '0.1.0',
    ...overrides,
  };
}

function setup(serverImpl: IDisconnectDeps['deleteServerSource']): {
  deps: IDisconnectDeps;
  log: string[];
} {
  const log: string[] = [];
  const local: IStudentLocalDataDeps = {
    listSources: async () => [makeSource()],
    removeSource: async (id) => {
      log.push(`local-remove:${id}`);
    },
    deleteCredential: async (key) => {
      log.push(`cred:${key}`);
    },
    removeLedgerEntries: async () => undefined,
  };
  return {
    log,
    deps: {
      local,
      deleteServerSource: async (studentId, sourceId) => {
        log.push(`server:${studentId}/${sourceId}`);
        await serverImpl(studentId, sourceId);
      },
    },
  };
}

describe('disconnectSource', () => {
  it('server-and-local: calls the API first, then removes locally', async () => {
    const { deps, log } = setup(async () => undefined);
    await disconnectSource(makeSource(), 'server-and-local', deps);
    expect(log).toEqual([
      'server:m1/local-canvas-school-m1',
      'cred:slc_creds_canvas_school.example.com',
      'local-remove:local-canvas-school-m1',
    ]);
  });

  it('server-and-local: an API failure leaves local state untouched', async () => {
    const { deps, log } = setup(async () => {
      throw new ApiError('Server exploded', 500, 'INTERNAL');
    });
    const err = await disconnectSource(makeSource(), 'server-and-local', deps).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(DisconnectError);
    expect((err as DisconnectError).code).toBe('SERVER_FAILED');
    expect((err as DisconnectError).message).toBe('Server exploded');
    expect(log).toEqual(['server:m1/local-canvas-school-m1']);
  });

  it('server-and-local: offline failure leaves local state untouched', async () => {
    const { deps, log } = setup(async () => {
      throw new ApiError("You're offline.", 0, 'OFFLINE');
    });
    await expect(disconnectSource(makeSource(), 'server-and-local', deps)).rejects.toBeInstanceOf(
      DisconnectError
    );
    expect(log.filter((l) => l.startsWith('local-remove'))).toEqual([]);
  });

  it('server-and-local: non-Error failures get a generic message', async () => {
    const { deps } = setup(async () => {
      // eslint-disable-next-line no-throw-literal -- exercising a non-Error rejection
      throw 'nope';
    });
    await expect(disconnectSource(makeSource(), 'server-and-local', deps)).rejects.toThrow(
      'Could not reach your account.'
    );
  });

  it('server-and-local: a 404 (already gone on the server) still removes locally', async () => {
    const { deps, log } = setup(async () => {
      throw new ApiError('Source not found', 404, 'NOT_FOUND');
    });
    await disconnectSource(makeSource(), 'server-and-local', deps);
    expect(log).toContain('local-remove:local-canvas-school-m1');
  });

  it('server-and-local: refuses (and changes nothing) when the source has no student id', async () => {
    const { deps, log } = setup(async () => undefined);
    const err = await disconnectSource(
      makeSource({ studentId: undefined }),
      'server-and-local',
      deps
    ).catch((e: unknown) => e);
    expect((err as DisconnectError).code).toBe('NO_STUDENT');
    expect(log).toEqual([]);
  });

  it('local-only: never calls the API', async () => {
    const { deps, log } = setup(async () => undefined);
    await disconnectSource(makeSource(), 'local-only', deps);
    expect(log.some((l) => l.startsWith('server:'))).toBe(false);
    expect(log).toContain('local-remove:local-canvas-school-m1');
  });
});

describe('disconnect dialog copy', () => {
  it('offers both choices for a source linked to a student', () => {
    expect(canDisconnectOnServer(makeSource())).toBe(true);
    const text = disconnectConfirmText(makeSource());
    expect(text).toContain(DISCONNECT_LOCAL_LABEL);
    expect(text).toContain(DISCONNECT_SERVER_LABEL);
  });

  it('offers only the phone copy when there is no student link', () => {
    const source = makeSource({ studentId: '' });
    expect(canDisconnectOnServer(source)).toBe(false);
    expect(disconnectConfirmText(source)).not.toContain(DISCONNECT_SERVER_LABEL);
  });

  it('failure message says nothing changed locally', () => {
    expect(disconnectFailureMessage(new Error('Timed out'))).toBe(
      'Timed out Nothing was changed on this phone — try again.'
    );
    expect(disconnectFailureMessage(undefined)).toContain('Unknown error.');
  });
});
