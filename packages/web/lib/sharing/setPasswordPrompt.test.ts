import {
  SET_PASSWORD_PROMPT_PREFIX,
  clearSetPasswordPrompt,
  markSetPasswordPrompt,
  shouldPromptSetPassword,
} from './setPasswordPrompt';

type PromptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

function memoryStorage(): PromptStorage & { keys(): string[] } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
    keys: () => [...map.keys()],
  };
}

describe('set-password prompt flag', () => {
  it('is per user: on for the account the magic link created, off for anyone else', () => {
    const storage = memoryStorage();
    expect(shouldPromptSetPassword('u-jen', storage)).toBe(false);
    markSetPasswordPrompt('u-jen', storage);
    expect(storage.getItem(`${SET_PASSWORD_PROMPT_PREFIX}u-jen`)).toBe('1');
    expect(shouldPromptSetPassword('u-jen', storage)).toBe(true);
    expect(shouldPromptSetPassword('u-other', storage)).toBe(false);
    expect(shouldPromptSetPassword(null, storage)).toBe(false);
    clearSetPasswordPrompt('u-jen', storage);
    expect(shouldPromptSetPassword('u-jen', storage)).toBe(false);
  });

  it('clearing without a user id (logout, reset done) removes every prompt and nothing else', () => {
    const storage = memoryStorage();
    storage.setItem('auth_token', 'keep');
    markSetPasswordPrompt('u-a', storage);
    markSetPasswordPrompt('u-b', storage);
    clearSetPasswordPrompt(undefined, storage);
    expect(storage.keys()).toEqual(['auth_token']);
  });

  it('survives a storage that throws and a missing storage', () => {
    const broken: PromptStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
      key: () => {
        throw new Error('blocked');
      },
      length: 1,
    };
    expect(() => markSetPasswordPrompt('u', broken)).not.toThrow();
    expect(shouldPromptSetPassword('u', broken)).toBe(false);
    expect(() => clearSetPasswordPrompt(undefined, broken)).not.toThrow();
    expect(shouldPromptSetPassword('u', null)).toBe(false);
    expect(() => clearSetPasswordPrompt('u', null)).not.toThrow();
  });
});
