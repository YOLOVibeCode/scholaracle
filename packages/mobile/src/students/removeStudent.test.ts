import { ApiError } from '../api/ApiError';
import { removeStudent, removeStudentConfirmText, type IRemoveStudentDeps } from './removeStudent';

const PURGE = { sourcesRemoved: 1, credentialsDeleted: 1, ledgerStudentIds: ['ext'] } as const;

function deps(deleteStudent: IRemoveStudentDeps['deleteStudent']): {
  deps: IRemoveStudentDeps;
  purge: jest.Mock;
} {
  const purge = jest.fn().mockResolvedValue(PURGE);
  return { deps: { deleteStudent, purgeLocal: purge }, purge };
}

describe('removeStudent', () => {
  it('deletes on the server, then purges local data', async () => {
    const order: string[] = [];
    const { deps: d, purge } = deps(async () => {
      order.push('server');
    });
    purge.mockImplementation(async () => {
      order.push('local');
      return PURGE;
    });

    const result = await removeStudent({ id: 'm1', studentId: 'ext' }, d);

    expect(order).toEqual(['server', 'local']);
    expect(purge).toHaveBeenCalledWith({ id: 'm1', studentId: 'ext' });
    expect(result).toBe(PURGE);
  });

  it('leaves local data untouched when the server call fails', async () => {
    const { deps: d, purge } = deps(async () => {
      throw new ApiError('boom', 500, 'INTERNAL');
    });
    await expect(removeStudent({ id: 'm1' }, d)).rejects.toThrow('boom');
    expect(purge).not.toHaveBeenCalled();
  });

  it('leaves local data untouched when offline', async () => {
    const { deps: d, purge } = deps(async () => {
      throw new ApiError("You're offline.", 0, 'OFFLINE');
    });
    await expect(removeStudent({ id: 'm1' }, d)).rejects.toThrow('offline');
    expect(purge).not.toHaveBeenCalled();
  });

  it('still purges locally when the student is already gone (404)', async () => {
    const { deps: d, purge } = deps(async () => {
      throw new ApiError('Student not found', 404, 'NOT_FOUND');
    });
    await removeStudent({ id: 'm1' }, d);
    expect(purge).toHaveBeenCalledTimes(1);
  });

  it('confirm text names the student and the irreversible local purge', () => {
    const text = removeStudentConfirmText('Ava');
    expect(text).toContain('Ava');
    expect(text).toMatch(/cannot be undone/);
    expect(text).toMatch(/passwords/);
  });
});
