import type { ISharingPendingInvite } from '@scholaracle/contracts';
import { groupPendingInvites, joinNames } from './inviteGroups';

function invite(
  studentId: string,
  studentName: string,
  extra: Partial<ISharingPendingInvite> & { invitedAt?: string; isAdmin?: boolean } = {}
): ISharingPendingInvite {
  return {
    studentId,
    studentName,
    invitedBy: extra.invitedBy ?? 'u-owner',
    ...(extra.invitedByName ? { invitedByName: extra.invitedByName } : {}),
    ...(extra.inviteGroupId ? { inviteGroupId: extra.inviteGroupId } : {}),
    invite: {
      email: 'jessica@example.com',
      role: 'parent',
      status: 'pending',
      invitedAt: extra.invitedAt ?? '2026-11-09T10:00:00.000Z',
      isAdmin: extra.isAdmin ?? false,
    },
  };
}

describe('groupPendingInvites', () => {
  it('turns one invitation across three students into one card', () => {
    const groups = groupPendingInvites([
      invite('s-chris', 'Christian', { inviteGroupId: 'grp-1', invitedByName: 'Ricardo', isAdmin: true, invitedAt: '2026-11-09T10:00:01.000Z' }),
      invite('s-ava', 'Ava', { inviteGroupId: 'grp-1', invitedByName: 'Ricardo', isAdmin: true }),
      invite('s-gid', 'Gideon', { inviteGroupId: 'grp-1', invitedByName: 'Ricardo', isAdmin: true, invitedAt: '2026-11-09T10:00:02.000Z' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: 'grp-1',
      inviterName: 'Ricardo',
      isAdmin: true,
      label: 'parent',
      selection: { inviteGroupId: 'grp-1' },
    });
    expect(groups[0]!.students.map((s) => s.name)).toEqual(['Ava', 'Christian', 'Gideon']);
  });

  it('keeps separate groups apart and falls back to student ids for legacy entries', () => {
    const groups = groupPendingInvites([
      invite('s-ava', 'Ava', { inviteGroupId: 'grp-1', invitedByName: 'Ricardo' }),
      invite('s-old', 'Old Entry', { invitedBy: 'u-other' }),
      invite('s-old2', 'Older Entry', { invitedBy: 'u-other' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[1]).toMatchObject({
      key: 'by:u-other',
      inviterName: 'A parent',
      selection: { studentIds: ['s-old', 's-old2'] },
    });
  });

  it('joinNames reads naturally', () => {
    expect(joinNames([])).toBe('a student');
    expect(joinNames(['Ava'])).toBe('Ava');
    expect(joinNames(['Ava', 'Christian'])).toBe('Ava and Christian');
    expect(joinNames(['Ava', 'Christian', 'Gideon'])).toBe('Ava, Christian and Gideon');
  });
});
