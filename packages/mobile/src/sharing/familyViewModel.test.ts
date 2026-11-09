import type { ISharingPerson } from '@scholaracle/contracts';
import {
  adminChangeConfirmText,
  familyActionLabel,
  familyRows,
  familyTitle,
  isDestructiveAction,
  isViewer,
  leaveConfirmText,
  peopleSummary,
  removePersonConfirmText,
  rowActions,
  textsChipText,
  type IFamilyViewer,
} from './familyViewModel';

const owner: ISharingPerson = {
  userId: 'u-owner',
  role: 'parent',
  status: 'accepted',
  isOwner: true,
  isAdmin: true,
};
const robert: ISharingPerson = {
  userId: 'u-robert',
  email: 'robert@example.com',
  name: 'Robert Lewis',
  role: 'parent',
  status: 'accepted',
  isOwner: false,
  isAdmin: false,
  smsStatus: 'opted_in',
  inviteGroupId: 'g1',
};
const jessica: ISharingPerson = {
  email: 'jessica@example.com',
  name: 'Jessica Lewis',
  role: 'guardian',
  status: 'pending',
  isOwner: false,
  isAdmin: true,
  smsStatus: 'invited',
  inviteGroupId: 'g2',
};
const jennifer: ISharingPerson = {
  email: 'jennifer@example.com',
  role: 'caregiver',
  status: 'declined',
  isOwner: false,
  isAdmin: false,
};
const people = [jennifer, jessica, robert, owner];

const asOwner: IFamilyViewer = { userId: 'u-owner', email: 'owner@example.com', access: 'owner' };
const asRobert: IFamilyViewer = {
  userId: 'u-robert',
  email: 'robert@example.com',
  access: 'member',
};
const asAdmin: IFamilyViewer = { userId: 'u-admin', email: 'admin@example.com', access: 'admin' };

describe('rows', () => {
  it('orders owner, accepted, invited, declined and fills the chips', () => {
    const rows = familyRows(people, asOwner);
    expect(rows.map((r) => r.displayName)).toEqual([
      'Owner',
      'Robert Lewis',
      'Jessica Lewis',
      'jennifer@example.com',
    ]);
    expect(rows[0]).toMatchObject({
      isYou: true,
      roleChip: 'Owner',
      labelChip: 'Parent',
      statusChip: null,
      textsChip: null,
    });
    expect(rows[1]).toMatchObject({
      roleChip: 'Member',
      statusChip: 'Accepted',
      textsChip: 'Texts: opted in',
      secondary: 'robert@example.com',
    });
    expect(rows[2]).toMatchObject({
      roleChip: 'Admin',
      labelChip: 'Guardian',
      statusChip: 'Invited',
      textsChip: 'Texts: invited',
    });
    expect(rows[3]).toMatchObject({
      roleChip: 'Member',
      labelChip: 'Caregiver',
      statusChip: 'Declined',
      textsChip: 'Texts: none',
    });
    expect(rows[3]?.secondary).toBeUndefined();
  });

  it('recognises the viewer by user id or by email', () => {
    expect(isViewer(owner, asOwner)).toBe(true);
    expect(isViewer(robert, asRobert)).toBe(true);
    expect(isViewer(jessica, { userId: 'x', email: 'JESSICA@example.com' })).toBe(true);
    expect(isViewer(robert, asOwner)).toBe(false);
  });

  it('texts chip copy', () => {
    expect(textsChipText(undefined)).toBe('Texts: none');
    expect(textsChipText('opted_out')).toBe('Texts: opted out');
  });
});

describe('actions follow the matrix', () => {
  it('owner viewer: manages everyone else; own row has My alerts only', () => {
    expect(rowActions(owner, asOwner)).toEqual(['my-alerts']);
    expect(rowActions(robert, asOwner)).toEqual(['make-admin', 'remove']);
    expect(rowActions(jessica, asOwner)).toEqual(['resend', 'remove']);
    expect(rowActions(jennifer, asOwner)).toEqual(['reinvite', 'remove']);
  });

  it('admin viewer: manages others (demote another admin), never the owner', () => {
    expect(rowActions(owner, asAdmin)).toEqual([]);
    expect(rowActions({ ...robert, isAdmin: true }, asAdmin)).toEqual(['remove-admin', 'remove']);
    expect(rowActions(jessica, asAdmin)).toEqual(['resend', 'remove']);
  });

  it('member viewer: only their own row, with My alerts and Leave', () => {
    expect(rowActions(owner, asRobert)).toEqual([]);
    expect(rowActions(jessica, asRobert)).toEqual([]);
    expect(rowActions(robert, asRobert)).toEqual(['my-alerts', 'leave']);
  });

  it('an admin viewer on their own row may leave but not remove themself', () => {
    const me: ISharingPerson = { ...robert, userId: 'u-admin', email: 'admin@example.com' };
    expect(rowActions(me, asAdmin)).toEqual(['my-alerts', 'leave']);
  });

  it('labels and destructive flags', () => {
    expect(familyActionLabel('resend')).toBe('Resend invitation');
    expect(familyActionLabel('reinvite')).toBe('Invite again');
    expect(familyActionLabel('make-admin')).toBe('Make admin');
    expect(familyActionLabel('remove-admin')).toBe('Remove admin');
    expect(isDestructiveAction('remove')).toBe(true);
    expect(isDestructiveAction('leave')).toBe(true);
    expect(isDestructiveAction('my-alerts')).toBe(false);
  });
});

describe('copy', () => {
  it('title and summary', () => {
    expect(familyTitle('Ava')).toBe('Family & guardians · Ava');
    expect(peopleSummary(people)).toBe('2 people · 1 invited');
    expect(peopleSummary([owner])).toBe('1 person');
  });

  it('confirmations name the person and the student', () => {
    expect(leaveConfirmText('Ava')).toMatch(/stop following Ava/);
    expect(removePersonConfirmText('Robert', 'Ava')).toMatch(/Robert will lose access to Ava/);
    expect(adminChangeConfirmText('Robert', true)).toMatch(/Only you can remove the student/);
    expect(adminChangeConfirmText('Robert', false)).toMatch(/can no longer edit/);
  });
});
