import type { ISharingPerson } from '@scholaracle/contracts';
import {
  canChangeAdmin,
  canEditOwnAlerts,
  canEditStudent,
  canLeave,
  canManagePeople,
  canManageSources,
  canRemovePerson,
  canRemoveStudent,
  canResend,
  isViewerRow,
  roleChipLabel,
  statusChipLabel,
  textsChipLabel,
} from './access';

const owner: ISharingPerson = {
  userId: 'u-owner',
  role: 'parent',
  status: 'accepted',
  isOwner: true,
  isAdmin: true,
};
const jessica: ISharingPerson = {
  userId: 'u-jess',
  email: 'jessica@example.com',
  role: 'parent',
  status: 'accepted',
  isOwner: false,
  isAdmin: true,
  smsStatus: 'opted_in',
};
const robert: ISharingPerson = {
  userId: 'u-rob',
  email: 'robert@example.com',
  role: 'guardian',
  status: 'accepted',
  isOwner: false,
  isAdmin: false,
  smsStatus: 'none',
};
const pending: ISharingPerson = {
  email: 'jennifer@example.com',
  role: 'caregiver',
  status: 'pending',
  isOwner: false,
  isAdmin: false,
  inviteGroupId: 'grp-1',
  smsStatus: 'invited',
};
const declined: ISharingPerson = { ...pending, email: 'no@example.com', status: 'declined' };

const asOwner = { userId: 'u-owner', email: 'owner@example.com' };
const asJessica = { userId: 'u-jess', email: 'jessica@example.com' };
const asRobert = { userId: 'u-rob', email: 'robert@example.com' };

describe('sharing access matrix (spec 4.2)', () => {
  it('student-level rights follow owner > admin > member', () => {
    expect([canEditStudent('owner'), canEditStudent('admin'), canEditStudent('member')]).toEqual([
      true,
      true,
      false,
    ]);
    expect([canRemoveStudent('owner'), canRemoveStudent('admin'), canRemoveStudent('member')]).toEqual(
      [true, false, false]
    );
    expect([canManageSources('owner'), canManageSources('admin'), canManageSources('member')]).toEqual(
      [true, true, false]
    );
    expect([canManagePeople('owner'), canManagePeople('admin'), canManagePeople('member')]).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('finds the viewer row by user id once accepted and by email while pending', () => {
    expect(isViewerRow(jessica, asJessica)).toBe(true);
    expect(isViewerRow(robert, asJessica)).toBe(false);
    expect(isViewerRow(pending, { userId: 'u-new', email: 'JENNIFER@example.com' })).toBe(true);
    expect(isViewerRow(owner, null)).toBe(false);
  });

  it('owner and admin promote/demote accepted adults, never the owner or themself', () => {
    expect(canChangeAdmin('owner', robert, asOwner)).toBe(true);
    expect(canChangeAdmin('admin', robert, asJessica)).toBe(true);
    expect(canChangeAdmin('admin', jessica, asJessica)).toBe(false);
    expect(canChangeAdmin('owner', owner, asOwner)).toBe(false);
    expect(canChangeAdmin('owner', pending, asOwner)).toBe(false);
    expect(canChangeAdmin('member', jessica, asRobert)).toBe(false);
  });

  it('remove and resend are for managers on other people; declined rows get no resend', () => {
    expect(canRemovePerson('owner', pending, asOwner)).toBe(true);
    expect(canRemovePerson('admin', robert, asJessica)).toBe(true);
    expect(canRemovePerson('admin', jessica, asJessica)).toBe(false);
    expect(canRemovePerson('member', pending, asRobert)).toBe(false);
    expect(canResend('owner', pending, asOwner)).toBe(true);
    expect(canResend('owner', robert, asOwner)).toBe(true);
    expect(canResend('owner', declined, asOwner)).toBe(false);
    expect(canResend('member', pending, asRobert)).toBe(false);
  });

  it('leave and My alerts belong to an accepted adult on their own row, never the owner', () => {
    expect(canLeave(robert, asRobert)).toBe(true);
    expect(canLeave(jessica, asJessica)).toBe(true);
    expect(canLeave(robert, asJessica)).toBe(false);
    expect(canLeave(owner, asOwner)).toBe(false);
    expect(canLeave(pending, { userId: 'x', email: 'jennifer@example.com' })).toBe(false);
    expect(canEditOwnAlerts(robert, asRobert)).toBe(true);
    expect(canEditOwnAlerts(owner, asOwner)).toBe(false);
  });

  it('chip labels', () => {
    expect(roleChipLabel(owner)).toBe('Owner');
    expect(roleChipLabel(jessica)).toBe('Admin');
    expect(roleChipLabel(robert)).toBe('Member');
    expect(statusChipLabel(pending)).toBe('Invited');
    expect(statusChipLabel(robert)).toBe('Accepted');
    expect(statusChipLabel(declined)).toBe('Declined');
    expect(textsChipLabel(jessica)).toBe('Texts: opted in');
    expect(textsChipLabel(pending)).toBe('Texts: invited');
    expect(textsChipLabel(robert)).toBe('Texts: none');
    expect(textsChipLabel({ ...robert, smsStatus: 'opted_out' })).toBe('Texts: opted out');
  });
});
