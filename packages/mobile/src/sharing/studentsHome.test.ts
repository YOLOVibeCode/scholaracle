import type { IMySharingStudent } from '@scholaracle/contracts';
import {
  anyShareable,
  emptyStudentsText,
  inviterName,
  needsInviterNames,
  peopleLine,
  sharedWithYouLine,
  studentSubline,
  type IStudentListItemWithInviter,
} from './studentsHome';

function item(overrides: Partial<IStudentListItemWithInviter>): IStudentListItemWithInviter {
  return {
    id: 's1',
    userId: 'u-owner',
    name: 'Ava',
    access: 'owner',
    peopleCount: 1,
    ...overrides,
  };
}

const mine: IMySharingStudent[] = [
  {
    studentId: 's1',
    name: 'Ava',
    access: 'member',
    invitedBy: { userId: 'u-owner', name: 'Ricardo' },
    alerts: { receiveAlerts: true, alertChannels: ['email', 'push'] },
  },
];

describe('shared-with-you line', () => {
  it('is empty for owned students', () => {
    expect(sharedWithYouLine(item({}))).toBeNull();
  });

  it('prefers the list item inviter, then /sharing/mine, then no name', () => {
    expect(
      inviterName(item({ access: 'member', invitedBy: { userId: 'x', name: 'Owner X' } }))
    ).toBe('Owner X');
    expect(sharedWithYouLine(item({ access: 'member' }), mine)).toBe(
      'Shared with you · by Ricardo'
    );
    expect(sharedWithYouLine(item({ access: 'admin' }))).toBe('Shared with you');
    expect(sharedWithYouLine(item({ id: 'other', access: 'member' }), mine)).toBe(
      'Shared with you'
    );
  });

  it('shows how many others follow an owned student', () => {
    expect(peopleLine({ access: 'owner', peopleCount: 1 })).toBeNull();
    expect(peopleLine({ access: 'owner', peopleCount: 2 })).toBe('Shared with 1 person');
    expect(peopleLine({ access: 'owner', peopleCount: 3 })).toBe('Shared with 2 people');
    expect(peopleLine({ access: 'member', peopleCount: 3 })).toBeNull();
  });

  it('studentSubline picks the shared line first', () => {
    expect(studentSubline(item({ peopleCount: 3 }))).toBe('Shared with 2 people');
    expect(studentSubline(item({ access: 'member', peopleCount: 3 }), mine)).toBe(
      'Shared with you · by Ricardo'
    );
  });

  it('asks for inviter names only when a shared student lacks one', () => {
    expect(needsInviterNames([item({})])).toBe(false);
    expect(needsInviterNames([item({ access: 'member' })])).toBe(true);
    expect(
      needsInviterNames([item({ access: 'member', invitedBy: { userId: 'x', name: 'N' } })])
    ).toBe(false);
  });

  it('offers Share when the viewer owns or manages a student', () => {
    expect(anyShareable([])).toBe(false);
    expect(anyShareable([{ access: 'member' }])).toBe(false);
    expect(anyShareable([{ access: 'member' }, { access: 'admin' }])).toBe(true);
  });

  it('empty-state copy points at the invitations when there are any', () => {
    expect(emptyStudentsText(0)).toMatch(/Add your kids/);
    expect(emptyStudentsText(1)).toMatch(/Accept an invitation above/);
  });
});
