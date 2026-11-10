import {
  accessLabel,
  accessMapFromStudents,
  accessOf,
  canDisconnectOnServerAs,
  canEditStudent,
  canInvite,
  canLeave,
  canManagePeople,
  canManagePortals,
  canRemoveStudent,
  connectPortalBlockedMessage,
  isAdminAccess,
} from './accessMatrix';

describe('access matrix (sharing-spec §4.2)', () => {
  it('owner and admin may edit, manage portals, manage people and invite; members may not', () => {
    for (const access of ['owner', 'admin'] as const) {
      expect(isAdminAccess(access)).toBe(true);
      expect(canEditStudent(access)).toBe(true);
      expect(canManagePortals(access)).toBe(true);
      expect(canManagePeople(access)).toBe(true);
      expect(canInvite(access)).toBe(true);
    }
    expect(isAdminAccess('member')).toBe(false);
    expect(canEditStudent('member')).toBe(false);
    expect(canManagePortals('member')).toBe(false);
    expect(canManagePeople('member')).toBe(false);
    expect(canInvite('member')).toBe(false);
  });

  it('only the owner may remove the student', () => {
    expect(canRemoveStudent('owner')).toBe(true);
    expect(canRemoveStudent('admin')).toBe(false);
    expect(canRemoveStudent('member')).toBe(false);
  });

  it('admins and members may leave; the owner may not', () => {
    expect(canLeave('owner')).toBe(false);
    expect(canLeave('admin')).toBe(true);
    expect(canLeave('member')).toBe(true);
  });

  it('treats missing access as no rights, except the server-decided disconnect option', () => {
    expect(canEditStudent(undefined)).toBe(false);
    expect(canEditStudent(null)).toBe(false);
    expect(canLeave(undefined)).toBe(false);
    expect(canDisconnectOnServerAs(undefined)).toBe(true);
    expect(canDisconnectOnServerAs(null)).toBe(true);
    expect(canDisconnectOnServerAs('owner')).toBe(true);
    expect(canDisconnectOnServerAs('admin')).toBe(true);
    expect(canDisconnectOnServerAs('member')).toBe(false);
  });

  it('labels and derives access from a person row', () => {
    expect(accessLabel('owner')).toBe('Owner');
    expect(accessLabel('admin')).toBe('Admin');
    expect(accessLabel('member')).toBe('Member');
    expect(accessOf({ isOwner: true, isAdmin: true })).toBe('owner');
    expect(accessOf({ isOwner: false, isAdmin: true })).toBe('admin');
    expect(accessOf({ isOwner: false, isAdmin: false })).toBe('member');
  });

  it('builds an id -> access map from the student list', () => {
    const map = accessMapFromStudents([
      { id: 'a', access: 'owner' },
      { id: 'b', access: 'member' },
    ]);
    expect(map.get('a')).toBe('owner');
    expect(map.get('b')).toBe('member');
    expect(map.get('c')).toBeUndefined();
  });

  it('explains why a member cannot connect a portal', () => {
    const text = connectPortalBlockedMessage('Ava');
    expect(text).toContain('Ava');
    expect(text).toMatch(/owner or an admin/);
  });
});
