import {
  SET_PASSWORD_PROMPT_KEY,
  clearSetPasswordPrompt,
  markSetPasswordPrompt,
  shouldPromptSetPassword,
} from './setPasswordPrompt';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('set-password prompt flag', () => {
  it('is off by default, on after a magic login that needs a password, off once cleared', () => {
    const storage = memoryStorage();
    expect(shouldPromptSetPassword(storage)).toBe(false);
    markSetPasswordPrompt(storage);
    expect(storage.getItem(SET_PASSWORD_PROMPT_KEY)).toBe('1');
    expect(shouldPromptSetPassword(storage)).toBe(true);
    clearSetPasswordPrompt(storage);
    expect(shouldPromptSetPassword(storage)).toBe(false);
  });

  it('survives a storage that throws and a missing storage', () => {
    const broken: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => markSetPasswordPrompt(broken)).not.toThrow();
    expect(shouldPromptSetPassword(broken)).toBe(false);
    expect(() => clearSetPasswordPrompt(broken)).not.toThrow();
    expect(shouldPromptSetPassword(null)).toBe(false);
  });
});
