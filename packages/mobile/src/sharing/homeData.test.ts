import type { IStudentListItem, ISharingPendingInvite } from '@scholaracle/contracts';
import {
  INITIAL_HOME,
  accessMapOf,
  canReturnToInvitations,
  emptyHomeReady,
  homeLoadFailed,
  homeLoaded,
  homeWithStudents,
  loadHomeData,
  showOnboardingGate,
  studentCountOf,
  type IHomeData,
} from './homeData';

function student(id: string, access: IStudentListItem['access'] = 'owner'): IStudentListItem {
  return { id, userId: 'u', name: id, access, peopleCount: 1 };
}

const invite = { studentId: 's9', studentName: 'Zoe' } as unknown as ISharingPendingInvite;

describe('loadHomeData', () => {
  it('fetches students and invitations together; a failing invitations call counts as none', async () => {
    const getMySharing = jest.fn();
    await expect(
      loadHomeData({
        getStudents: async () => [student('a')],
        getPendingSharingInvites: async () => {
          throw new Error('offline');
        },
        getMySharing,
      })
    ).resolves.toEqual({ students: [student('a')], pendingInvites: [], mine: null });
    expect(getMySharing).not.toHaveBeenCalled();
  });

  it('asks /sharing/mine only when a shared student lacks an inviter name', async () => {
    const mine = [{ studentId: 'b', name: 'b', access: 'member', alerts: {} }];
    const getMySharing = jest.fn(async () => ({ students: mine }));
    const loaded = await loadHomeData({
      getStudents: async () => [student('b', 'member')],
      getPendingSharingInvites: async () => [invite],
      getMySharing: getMySharing as never,
    });
    expect(getMySharing).toHaveBeenCalledTimes(1);
    expect(loaded.mine).toEqual(mine);
    expect(loaded.pendingInvites).toEqual([invite]);
  });

  it('throws only when the students call fails', async () => {
    await expect(
      loadHomeData({
        getStudents: async () => {
          throw new Error('500');
        },
        getPendingSharingInvites: async () => [],
        getMySharing: async () => ({ students: [] }),
      })
    ).rejects.toThrow('500');
  });
});

describe('home state transitions', () => {
  const ready: IHomeData = homeLoaded({
    students: [student('a')],
    pendingInvites: [invite],
    mine: null,
  });

  it('a successful load is ready with no error', () => {
    expect(ready.status).toBe('ready');
    expect(ready.error).toBeNull();
    expect(studentCountOf(ready)).toBe(1);
  });

  it('a failed refresh keeps the previous data and status (never resets to zero)', () => {
    const failed = homeLoadFailed(ready, 'offline');
    expect(failed.status).toBe('ready');
    expect(failed.students).toEqual([student('a')]);
    expect(failed.pendingInvites).toEqual([invite]);
    expect(failed.error).toBe('offline');
    expect(studentCountOf(failed)).toBe(1);
  });

  it('only the very first failure becomes an error state, still with no data', () => {
    const failed = homeLoadFailed(INITIAL_HOME, 'offline');
    expect(failed.status).toBe('error');
    expect(failed.students).toEqual([]);
    expect(studentCountOf(INITIAL_HOME)).toBeNull();
    expect(studentCountOf(failed)).toBe(0);
  });

  it('student sessions are ready with nothing; onboarding shows the new students at once', () => {
    expect(emptyHomeReady()).toEqual({ ...INITIAL_HOME, status: 'ready' });
    const after = homeWithStudents(homeLoadFailed(INITIAL_HOME, 'x'), [student('n')]);
    expect(after).toMatchObject({ status: 'ready', students: [student('n')], error: null });
  });

  it('derives the access map', () => {
    const map = accessMapOf(
      homeLoaded({
        students: [student('a'), student('b', 'member')],
        pendingInvites: [],
        mine: null,
      })
    );
    expect(map.get('a')).toBe('owner');
    expect(map.get('b')).toBe('member');
  });
});

describe('onboarding gate', () => {
  const empty = homeLoaded({ students: [], pendingInvites: [], mine: null });
  const invited = homeLoaded({ students: [], pendingInvites: [invite], mine: null });

  it('shows onboarding only for a ready, empty account with nothing pending', () => {
    expect(showOnboardingGate(empty, false)).toBe(true);
    expect(showOnboardingGate(invited, false)).toBe(false);
    expect(showOnboardingGate(invited, true)).toBe(true);
    expect(
      showOnboardingGate(
        homeLoaded({ students: [student('a')], pendingInvites: [], mine: null }),
        true
      )
    ).toBe(false);
  });

  it('never on loading or error: the Students screen shows Retry instead', () => {
    expect(showOnboardingGate(INITIAL_HOME, false)).toBe(false);
    expect(showOnboardingGate(homeLoadFailed(INITIAL_HOME, 'offline'), false)).toBe(false);
  });

  it('offers Back to the invitations only when one is waiting behind onboarding', () => {
    expect(canReturnToInvitations(invited, true)).toBe(true);
    expect(canReturnToInvitations(invited, false)).toBe(false);
    expect(canReturnToInvitations(empty, true)).toBe(false);
  });
});
