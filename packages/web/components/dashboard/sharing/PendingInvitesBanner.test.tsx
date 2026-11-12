/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import type { ISharingPendingInvite } from '@scholaracle/contracts';
import { PendingInvitesBanner } from './PendingInvitesBanner';
import { sharingApi } from '@/lib/api/sharing';

jest.mock('@/lib/api/sharing', () => ({
  sharingApi: { getPendingInvites: jest.fn() },
}));

const pendingMock = sharingApi.getPendingInvites as jest.MockedFunction<
  typeof sharingApi.getPendingInvites
>;

const INVITE: ISharingPendingInvite = {
  studentId: 's-ava',
  studentName: 'Ava',
  invitedBy: 'u-owner',
  invitedByName: 'Ricardo',
  inviteGroupId: 'grp-1',
  invite: {
    email: 'jessica@example.com',
    role: 'parent',
    status: 'pending',
    invitedAt: '2026-11-09T10:00:00.000Z',
    isAdmin: true,
  },
};

describe('PendingInvitesBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when there are no pending invitations', async () => {
    pendingMock.mockResolvedValue([]);
    const { container } = render(<PendingInvitesBanner />);
    await waitFor(() => expect(pendingMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('counts invitations by group and links to /dashboard/invites', async () => {
    pendingMock.mockResolvedValue([
      INVITE,
      { ...INVITE, studentId: 's-chris', studentName: 'Christian' },
      { ...INVITE, studentId: 's-gid', studentName: 'Gideon' },
    ]);
    render(<PendingInvitesBanner />);
    const banner = await screen.findByTestId('pending-invites-banner');
    expect(banner).toHaveTextContent('You have 1 pending invitation');
    expect(screen.getByTestId('pending-invites-from')).toHaveTextContent('Ricardo shared students with you.');
    expect(screen.getByTestId('pending-invites-link')).toHaveAttribute('href', '/dashboard/invites');
  });

  it('stays hidden when the request fails', async () => {
    pendingMock.mockRejectedValue(new Error('offline'));
    const { container } = render(<PendingInvitesBanner />);
    await waitFor(() => expect(pendingMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
