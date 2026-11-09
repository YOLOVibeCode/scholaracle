/**
 * R2 — optimistic submit: the screen moves first, snaps back on failure, and
 * the server's answer reaches the caller.
 */

import { submitWithRollback } from './optimisticUpdate';

describe('submitWithRollback', () => {
  it('shows the optimistic view, then returns the server result', async () => {
    const shown: string[] = [];
    const result = await submitWithRollback<string, { ok: boolean }>({
      current: 'before',
      optimistic: (v) => `${v}+picked`,
      set: (v) => shown.push(v),
      submit: async () => ({ ok: true }),
    });
    expect(shown).toEqual(['before+picked']);
    expect(result).toEqual({ ok: true });
  });

  it('restores the snapshot when the server refuses, and rethrows', async () => {
    const shown: string[] = [];
    await expect(
      submitWithRollback<string, void>({
        current: 'before',
        optimistic: () => 'after',
        set: (v) => shown.push(v),
        submit: async () => {
          throw new Error('offline');
        },
      })
    ).rejects.toThrow('offline');
    expect(shown).toEqual(['after', 'before']);
  });

  it('with nothing loaded it only submits', async () => {
    const set = jest.fn();
    const result = await submitWithRollback<string, number>({
      current: null,
      optimistic: () => 'x',
      set,
      submit: async () => 7,
    });
    expect(set).not.toHaveBeenCalled();
    expect(result).toBe(7);
    await expect(
      submitWithRollback<string, number>({
        current: null,
        optimistic: () => 'x',
        set,
        submit: async () => {
          throw new Error('no');
        },
      })
    ).rejects.toThrow('no');
    expect(set).not.toHaveBeenCalled();
  });
});
