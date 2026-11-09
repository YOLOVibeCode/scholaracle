import { checkAndFetchOta, resolveUpdateGate, type IUpdatesApi } from './launchChecks';
import { NO_GATE, type IMinVersionPolicy } from '../version/minVersion';

function updates(over: Partial<IUpdatesApi> = {}): IUpdatesApi & {
  checkForUpdateAsync: jest.Mock;
  fetchUpdateAsync: jest.Mock;
} {
  return {
    isEnabled: true,
    checkForUpdateAsync: jest.fn(async () => ({ isAvailable: true })),
    fetchUpdateAsync: jest.fn(async () => ({ isNew: true })),
    ...over,
  } as IUpdatesApi & { checkForUpdateAsync: jest.Mock; fetchUpdateAsync: jest.Mock };
}

describe('checkAndFetchOta', () => {
  it('does nothing in dev', async () => {
    const u = updates();
    expect(await checkAndFetchOta(u, true)).toBe('skipped-dev');
    expect(u.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it('does nothing when updates are unavailable or disabled', async () => {
    expect(await checkAndFetchOta(null, false)).toBe('disabled');
    const u = updates({ isEnabled: false });
    expect(await checkAndFetchOta(u, false)).toBe('disabled');
    expect(u.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it('downloads when an update is available', async () => {
    const u = updates();
    expect(await checkAndFetchOta(u, false)).toBe('downloaded');
    expect(u.fetchUpdateAsync).toHaveBeenCalledTimes(1);
  });

  it('skips the download when already current', async () => {
    const u = updates({ checkForUpdateAsync: jest.fn(async () => ({ isAvailable: false })) });
    expect(await checkAndFetchOta(u, false)).toBe('up-to-date');
    expect(u.fetchUpdateAsync).not.toHaveBeenCalled();
  });

  it('swallows errors (offline, server down)', async () => {
    const u = updates({
      checkForUpdateAsync: jest.fn(async () => {
        throw new Error('offline');
      }),
    });
    expect(await checkAndFetchOta(u, false)).toBe('error');
  });

  it('has no reload method on its contract, so it cannot restart mid-session', () => {
    const u = updates();
    expect(Object.keys(u)).not.toContain('reloadAsync');
  });
});

describe('resolveUpdateGate', () => {
  const required: IMinVersionPolicy = {
    minVersion: '2.0.0',
    minBuild: null,
    message: 'Please update.',
    storeUrls: { ios: 'https://apps.apple.com/x', android: 'https://play.google.com/y' },
  };
  const base = { currentVersion: '1.0.0', currentBuild: '3', platform: 'ios' };

  it('returns the gate with the platform store link when below the floor', async () => {
    expect(await resolveUpdateGate({ ...base, fetchPolicy: async () => required })).toEqual({
      message: 'Please update.',
      storeUrl: 'https://apps.apple.com/x',
    });
    expect(
      await resolveUpdateGate({ ...base, platform: 'android', fetchPolicy: async () => required })
    ).toEqual({ message: 'Please update.', storeUrl: 'https://play.google.com/y' });
  });

  it('returns null when current or no gate', async () => {
    expect(
      await resolveUpdateGate({
        ...base,
        currentVersion: '2.0.0',
        fetchPolicy: async () => required,
      })
    ).toBeNull();
    expect(await resolveUpdateGate({ ...base, fetchPolicy: async () => NO_GATE })).toBeNull();
  });

  it('fails open when the policy fetch throws', async () => {
    const fetchPolicy = async (): Promise<IMinVersionPolicy> => {
      throw new Error('boom');
    };
    expect(await resolveUpdateGate({ ...base, fetchPolicy })).toBeNull();
  });
});
