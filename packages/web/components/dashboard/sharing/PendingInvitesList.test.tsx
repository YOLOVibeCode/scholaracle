/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ISharingPendingInvite } from '@scholaracle/contracts';
import { PendingInvitesList } from './PendingInvitesList';
import { sharingApi } from '@/lib/api/sharing';

jest.mock('@/lib/api/sharing', () => ({
  sharingApi: { getPendingInvites: jest.fn(), accept: jest.fn(), decline: jest.fn() },
}));

const api = sharingApi as jest.Mocked<typeof sharingApi>;

function invite(studentId: string, studentName: string, groupId?: string, invitedBy = 'u-owner'): ISharingPendingInvite {
  return {
    studentId,
    studentName,
    invitedBy,
    invitedByName: invitedBy === 'u-owner' ? 'Ricardo' : undefined,
    ...(groupId ? { inviteGroupId: groupId } : {}),
    invite: {
      email: 'jennifer@example.com',
      role: 'guardian',
      status: 'pending',
      invitedAt: '2026-11-09T10:00:00.000Z',
      isAdmin: false,
    },
  };
}

describe('PendingInvitesList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows an empty state', async () => {
    api.getPendingInvites.mockResolvedValue([]);
    render(<PendingInvitesList />);
    expect(await screen.findByTestId('invites-empty')).toBeInTheDocument();
  });

  it('renders one card per invitation and accepts by group id', async () => {
    api.getPendingInvites
      .mockResolvedValueOnce([
        invite('s-chris', 'Christian', 'grp-1'),
        invite('s-gid', 'Gideon', 'grp-1'),
        invite('s-old', 'Legacy Kid', undefined, 'u-other'),
      ])
      .mockResolvedValue([invite('s-old', 'Legacy Kid', undefined, 'u-other')]);
    api.accept.mockResolvedValue({ success: true, studentIds: ['s-chris', 's-gid'] });
    const onChanged = jest.fn();
    render(<PendingInvitesList onChanged={onChanged} />);

    const card = await screen.findByTestId('invite-card-grp-1');
    expect(card).toHaveTextContent('Ricardo invited you to follow Christian and Gideon');
    expect(card).toHaveTextContent('Member');
    expect(screen.getByTestId('invite-card-by:u-other')).toHaveTextContent('A parent invited you');

    fireEvent.click(screen.getByTestId('invite-accept-grp-1'));
    await waitFor(() => expect(api.accept).toHaveBeenCalledWith({ inviteGroupId: 'grp-1' }));
    expect(await screen.findByTestId('invites-status')).toHaveTextContent('You now follow Christian and Gideon.');
    expect(onChanged).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId('invite-card-grp-1')).not.toBeInTheDocument());
  });

  it('declines legacy entries by student ids and reports errors', async () => {
    api.getPendingInvites.mockResolvedValue([invite('s-old', 'Legacy Kid', undefined, 'u-other')]);
    api.decline.mockRejectedValueOnce(new Error('No pending invitations found'));
    render(<PendingInvitesList />);

    fireEvent.click(await screen.findByTestId('invite-decline-by:u-other'));
    await waitFor(() => expect(api.decline).toHaveBeenCalledWith({ studentIds: ['s-old'] }));
    expect(await screen.findByText(/No pending invitations found/)).toBeInTheDocument();
  });
});
