import * as SecureStore from 'expo-secure-store';
import { ConnectedSourceStore } from '../sources/ConnectedSourceStore';
import type { IStudentListItem } from '@scholaracle/contracts';
import { ApiError } from '../api/ApiError';
import { applyOnboarding } from './applyOnboarding';
import type { IOnboardingState } from './onboardingMachine';
import { createInitialOnboardingState, updateChild } from './onboardingMachine';

function householdState(): IOnboardingState {
  let state = createInitialOnboardingState('logged-in');
  state = updateChild(state, state.children[0]!.key, { name: 'Gideon', grade: '8' });
  state = {
    ...state,
    children: [...state.children, { key: 'c2', name: 'Christian', grade: '6' }],
    provider: 'skyward',
    portalUrl: 'https://skyward.iscorp.com',
    username: 'parent',
    portalPassword: 'mock-school-secret',
  };
  return state;
}

describe('applyOnboarding', () => {
  beforeEach(async () => {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.clear();
    (SecureStore.setItemAsync as jest.Mock).mockClear();
  });

  it('creates each named child, shares one Keychain entry, and unique source ids', async () => {
    const created: IStudentListItem[] = [
      { id: 'mongo-g', userId: 'u1', name: 'Gideon', grade: 8 },
      { id: 'mongo-c', userId: 'u1', name: 'Christian', grade: 6 },
    ];
    let i = 0;
    const createStudent = jest.fn(async () => created[i++]!);
    const registerIngestSource = jest.fn(async () => undefined);
    const store = new ConnectedSourceStore();

    const result = await applyOnboarding(householdState(), {
      createStudent,
      registerIngestSource,
      sources: store,
    });

    expect(createStudent).toHaveBeenCalledTimes(2);
    expect(createStudent).toHaveBeenNthCalledWith(1, { name: 'Gideon', grade: 8 });
    expect(createStudent).toHaveBeenNthCalledWith(2, { name: 'Christian', grade: 6 });
    expect(result.students.map((s) => s.name)).toEqual(['Gideon', 'Christian']);

    const sources = await store.list();
    expect(sources).toHaveLength(2);
    expect(new Set(sources.map((s) => s.sourceId)).size).toBe(2);
    expect(sources.every((s) => s.credentialKey === sources[0]?.credentialKey)).toBe(true);
    expect(sources.some((s) => s.studentExternalId === 'default')).toBe(false);
    expect(sources.map((s) => s.studentId).sort()).toEqual(['mongo-c', 'mongo-g']);

    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(
      (SecureStore.setItemAsync as jest.Mock).mock.calls[0][1] as string
    ) as {
      username: string;
      password: string;
    };
    expect(payload.username).toBe('parent');
    expect(payload.password).toBe('mock-school-secret');
    expect(registerIngestSource).toHaveBeenCalledTimes(2);
  });

  it('never writes studentExternalId default when SIS id is missing', async () => {
    const store = new ConnectedSourceStore();
    await applyOnboarding(householdState(), {
      createStudent: async () => ({ id: 'mongo-g', userId: 'u1', name: 'Gideon' }),
      registerIngestSource: async () => undefined,
      sources: store,
    });
    const sources = await store.list();
    expect(sources[0]?.studentExternalId).toBe('mongo-g');
  });

  it('keeps the first child when a later create hits a plan limit', async () => {
    const store = new ConnectedSourceStore();
    const createStudent = jest
      .fn()
      .mockResolvedValueOnce({ id: 'mongo-g', userId: 'u1', name: 'Gideon', grade: 8 })
      .mockRejectedValueOnce(
        new ApiError('Your free plan allows up to 1 student', 403, 'PLAN_LIMIT_REACHED')
      );

    const result = await applyOnboarding(householdState(), {
      createStudent,
      registerIngestSource: async () => undefined,
      sources: store,
    });

    expect(result.students).toHaveLength(1);
    expect(result.students[0]?.name).toBe('Gideon');
    expect(result.planLimitReached).toBe(true);
    expect(await store.list()).toHaveLength(1);
  });
});
