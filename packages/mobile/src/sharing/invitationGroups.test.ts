import type { ISharingPendingInvite } from '@scholaracle/contracts';
import {
  acceptedMessage,
  groupPendingInvites,
  invitationBannerText,
  invitationSelection,
  invitationSubtitle,
  invitationTitle,
  joinNames,
  labelText,
} from './invitationGroups';

function invite(
  studentId: string,
  studentName: string,
  overrides: Partial<Omit<ISharingPendingInvite, 'invite'>> & {
    readonly invite?: Partial<ISharingPendingInvite['invite']>;
  } = {}
): ISharingPendingInvite {
  const { invite: inviteOverrides, ...rest } = overrides;
  return {
    studentId,
    studentName,
    invitedBy: 'owner-1',
    invitedByName: 'Ricardo',
    ...rest,
    invite: {
      email: 'jessica@example.com',
      role: 'parent',
      status: 'pending',
      invitedAt: '2026-11-09T10:00:00.000Z',
      isAdmin: false,
      ...inviteOverrides,
    },
  };
}

describe('groupPendingInvites', () => {
  it('puts every student of one inviteGroupId on one card, newest card first', () => {
    const cards = groupPendingInvites([
      invite('s1', 'Ava', { inviteGroupId: 'g1', invite: { invitedAt: '2026-11-09T10:00:00Z' } }),
      invite('s2', 'Christian', {
        inviteGroupId: 'g1',
        invite: { invitedAt: '2026-11-09T10:00:01Z' },
      }),
      invite('s3', 'Gideon', {
        inviteGroupId: 'g2',
        invitedByName: 'Jennifer',
        invite: { invitedAt: '2026-11-10T08:00:00Z', isAdmin: true, role: 'guardian' },
      }),
    ]);
    expect(cards).toHaveLength(2);
    expect(cards[0]?.inviteGroupId).toBe('g2');
    expect(cards[0]?.inviterName).toBe('Jennifer');
    expect(cards[1]?.studentNames).toEqual(['Ava', 'Christian']);
    expect(cards[1]?.studentIds).toEqual(['s1', 's2']);
    expect(cards[1]?.invitedAt).toBe('2026-11-09T10:00:00Z');
  });

  it('keeps entries without a group id as single-student cards', () => {
    const cards = groupPendingInvites([invite('s1', 'Ava'), invite('s2', 'Christian')]);
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.key).sort()).toEqual(['student:s1', 'student:s2']);
    expect(cards[0]?.inviteGroupId).toBeUndefined();
  });

  it('falls back to "Someone" when the inviter has no name', () => {
    const [card] = groupPendingInvites([invite('s1', 'Ava', { invitedByName: undefined })]);
    expect(card?.inviterName).toBe('Someone');
  });

  it('returns no cards for no invites', () => {
    expect(groupPendingInvites([])).toEqual([]);
  });
});

describe('selection and copy', () => {
  const grouped = groupPendingInvites([
    invite('s1', 'Ava', { inviteGroupId: 'g1' }),
    invite('s2', 'Christian', { inviteGroupId: 'g1' }),
    invite('s3', 'Gideon', { inviteGroupId: 'g1' }),
  ])[0]!;
  const single = groupPendingInvites([invite('s9', 'Zoe', { invite: { isAdmin: true } })])[0]!;

  it('selects by group when there is one, else by student ids', () => {
    expect(invitationSelection(grouped)).toEqual({ inviteGroupId: 'g1' });
    expect(invitationSelection(single)).toEqual({ studentIds: ['s9'] });
  });

  it('joins names in prose', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['Ava'])).toBe('Ava');
    expect(joinNames(['Ava', 'Christian'])).toBe('Ava and Christian');
    expect(joinNames(['Ava', 'Christian', 'Gideon'])).toBe('Ava, Christian and Gideon');
  });

  it('writes the title, subtitle and accepted message', () => {
    expect(invitationTitle(grouped)).toBe(
      'Ricardo invited you to follow Ava, Christian and Gideon'
    );
    expect(invitationSubtitle(grouped)).toBe('Parent');
    expect(invitationSubtitle(single)).toBe('Parent · can manage');
    expect(acceptedMessage(grouped)).toBe(
      'Ava, Christian and Gideon now appear in your Students list.'
    );
    expect(acceptedMessage(single)).toBe('Zoe now appears in your Students list.');
  });

  it('labels and banner text', () => {
    expect(labelText('caregiver')).toBe('Caregiver');
    expect(invitationBannerText(0)).toBeNull();
    expect(invitationBannerText(1)).toBe('You have 1 invitation');
    expect(invitationBannerText(3)).toBe('You have 3 invitations');
  });
});
