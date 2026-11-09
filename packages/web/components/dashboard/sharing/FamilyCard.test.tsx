/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ISharingPerson } from '@scholaracle/contracts';
import { FamilyCard } from './FamilyCard';
import { sharingApi } from '@/lib/api/sharing';

jest.mock('@/lib/api/sharing', () => ({
  sharingApi: {
    listPeople: jest.fn(),
    resend: jest.fn(),
    resendContact: jest.fn(),
    sendLoginLink: jest.fn(),
    setAdmin: jest.fn(),
    removePerson: jest.fn(),
    invite: jest.fn(),
    updatePerson: jest.fn(),
    leave: jest.fn(),
  },
}));

const api = sharingApi as jest.Mocked<typeof sharingApi>;

const OWNER: ISharingPerson = {
  userId: 'u-owner',
  role: 'parent',
  status: 'accepted',
  isOwner: true,
  isAdmin: true,
  alertChannels: ['email'],
};
const JESSICA: ISharingPerson = {
  userId: 'u-jess',
  email: 'jessica@example.com',
  name: 'Jessica',
  role: 'parent',
  status: 'accepted',
  isOwner: false,
  isAdmin: true,
  smsStatus: 'opted_in',
  alertChannels: ['email', 'push'],
  receiveAlerts: true,
};
const ROBERT: ISharingPerson = {
  userId: 'u-rob',
  email: 'robert@example.com',
  name: 'Robert',
  role: 'guardian',
  status: 'accepted',
  isOwner: false,
  isAdmin: false,
  smsStatus: 'none',
  alertChannels: ['email', 'push'],
  receiveAlerts: true,
};
const PENDING: ISharingPerson = {
  email: 'jennifer@example.com',
  name: 'Jennifer',
  role: 'caregiver',
  status: 'pending',
  isOwner: false,
  isAdmin: false,
  inviteGroupId: 'grp-1',
  smsStatus: 'invited',
};
const LEGACY_PENDING: ISharingPerson = {
  email: 'legacy@example.com',
  role: 'parent',
  status: 'pending',
  isOwner: false,
  isAdmin: false,
};
const DECLINED: ISharingPerson = {
  email: 'declined@example.com',
  role: 'parent',
  status: 'declined',
  isOwner: false,
  isAdmin: false,
};

const PEOPLE = [OWNER, JESSICA, ROBERT, PENDING, LEGACY_PENDING, DECLINED];

const asOwner = { userId: 'u-owner', email: 'owner@example.com' };
const asJessica = { userId: 'u-jess', email: 'jessica@example.com' };
const asRobert = { userId: 'u-rob', email: 'robert@example.com' };

describe('FamilyCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.listPeople.mockResolvedValue(PEOPLE);
  });

  it('owner: chips for every row and every management control, no Leave or My alerts', async () => {
    const onShare = jest.fn();
    render(
      <FamilyCard studentId="s-ava" studentName="Ava" access="owner" viewer={asOwner} onShare={onShare} />
    );
    await screen.findByTestId('family-row-owner');

    expect(screen.getByTestId('family-name-owner')).toHaveTextContent('Account owner (you)');
    expect(screen.getByTestId('family-chip-role-owner')).toHaveTextContent('Owner');
    expect(screen.getByTestId('family-chip-role-jessica@example.com')).toHaveTextContent('Admin');
    expect(screen.getByTestId('family-chip-role-robert@example.com')).toHaveTextContent('Member');
    expect(screen.getByTestId('family-chip-status-jennifer@example.com')).toHaveTextContent('Invited');
    expect(screen.getByTestId('family-chip-status-robert@example.com')).toHaveTextContent('Accepted');
    expect(screen.getByTestId('family-chip-status-declined@example.com')).toHaveTextContent('Declined');
    expect(screen.getByTestId('family-chip-texts-jessica@example.com')).toHaveTextContent('Texts: opted in');
    expect(screen.getByTestId('family-chip-texts-jennifer@example.com')).toHaveTextContent('Texts: invited');
    expect(screen.getByTestId('family-chip-texts-robert@example.com')).toHaveTextContent('Texts: none');

    expect(screen.getByTestId('family-share')).toBeInTheDocument();
    expect(screen.getByTestId('family-toggle-admin-jessica@example.com')).toHaveTextContent('Remove admin');
    expect(screen.getByTestId('family-toggle-admin-robert@example.com')).toHaveTextContent('Make admin');
    expect(screen.queryByTestId('family-toggle-admin-jennifer@example.com')).not.toBeInTheDocument();
    expect(screen.getByTestId('family-remove-jennifer@example.com')).toBeInTheDocument();
    expect(screen.getByTestId('family-remove-declined@example.com')).toBeInTheDocument();
    expect(screen.getByTestId('family-reinvite-declined@example.com')).toBeInTheDocument();
    expect(screen.getByTestId('family-resend-jennifer@example.com')).toHaveTextContent('Resend');
    expect(screen.getByTestId('family-resend-robert@example.com')).toHaveTextContent('Send sign-in link');
    expect(screen.queryByTestId('family-resend-declined@example.com')).not.toBeInTheDocument();
    expect(screen.queryByTestId(/^family-leave-/)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/^family-my-alerts-/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('family-member-note')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('family-share'));
    expect(onShare).toHaveBeenCalled();
  });

  it('owner: pending rows re-send the invitation (by group, or re-issued for a legacy row); accepted rows get a sign-in link', async () => {
    api.resend.mockResolvedValue({ success: true, studentIds: ['s-ava'], expiresAt: '2026-11-16T00:00:00.000Z' });
    api.resendContact.mockResolvedValue({ success: true, studentIds: ['s-ava'], expiresAt: '2026-11-16T00:00:00.000Z' });
    api.sendLoginLink.mockResolvedValue({ success: true });
    api.setAdmin.mockResolvedValue(true);
    api.removePerson.mockResolvedValue(true);
    render(<FamilyCard studentId="s-ava" studentName="Ava" access="owner" viewer={asOwner} />);
    await screen.findByTestId('family-row-owner');

    fireEvent.click(screen.getByTestId('family-resend-jennifer@example.com'));
    await waitFor(() => expect(api.resend).toHaveBeenCalledWith('grp-1'));
    expect(await screen.findByTestId('family-notice-jennifer@example.com')).toHaveTextContent('Invitation re-sent');

    const listCalls = api.listPeople.mock.calls.length;
    fireEvent.click(screen.getByTestId('family-resend-legacy@example.com'));
    await waitFor(() => expect(api.resendContact).toHaveBeenCalledWith('s-ava', 'legacy@example.com'));
    expect(await screen.findByTestId('family-notice-legacy@example.com')).toHaveTextContent('Invitation re-sent');
    await waitFor(() => expect(api.listPeople.mock.calls.length).toBeGreaterThan(listCalls));
    expect(api.sendLoginLink).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('family-resend-robert@example.com'));
    await waitFor(() => expect(api.sendLoginLink).toHaveBeenCalledWith('s-ava', 'robert@example.com', 'email'));
    expect(await screen.findByTestId('family-notice-robert@example.com')).toHaveTextContent('Sign-in link sent');

    fireEvent.click(screen.getByTestId('family-toggle-admin-robert@example.com'));
    await waitFor(() => expect(api.setAdmin).toHaveBeenCalledWith('s-ava', 'robert@example.com', true));

    fireEvent.click(screen.getByTestId('family-remove-jennifer@example.com'));
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(dialog).toHaveTextContent('Remove this person?');
    fireEvent.click(within(dialog).getByTestId('button-confirm-dialog'));
    await waitFor(() => expect(api.removePerson).toHaveBeenCalledWith('s-ava', 'jennifer@example.com'));
    expect(api.listPeople.mock.calls.length).toBeGreaterThan(1);
  });

  it('admin: manages others but gets My alerts and Leave on her own row, nothing on the owner row', async () => {
    render(<FamilyCard studentId="s-ava" studentName="Ava" access="admin" viewer={asJessica} onShare={jest.fn()} />);
    await screen.findByTestId('family-row-owner');

    expect(screen.getByTestId('family-share')).toBeInTheDocument();
    expect(screen.getByTestId('family-name-jessica@example.com')).toHaveTextContent('Jessica (you)');
    expect(screen.queryByTestId('family-toggle-admin-jessica@example.com')).not.toBeInTheDocument();
    expect(screen.queryByTestId('family-remove-jessica@example.com')).not.toBeInTheDocument();
    expect(screen.getByTestId('family-my-alerts-jessica@example.com')).toBeInTheDocument();
    expect(screen.getByTestId('family-leave-jessica@example.com')).toBeInTheDocument();
    expect(screen.getByTestId('family-toggle-admin-robert@example.com')).toBeInTheDocument();
    expect(screen.getByTestId('family-remove-robert@example.com')).toBeInTheDocument();
    const ownerRow = screen.getByTestId('family-row-owner');
    expect(within(ownerRow).queryAllByRole('button')).toHaveLength(0);
  });

  it('member: no management controls; My alerts saves, Silence turns everything off, Leave confirms', async () => {
    api.updatePerson.mockResolvedValue({ success: true });
    api.leave.mockResolvedValue(true);
    const onLeft = jest.fn();
    render(
      <FamilyCard studentId="s-ava" studentName="Ava" access="member" viewer={asRobert} onShare={jest.fn()} onLeft={onLeft} />
    );
    await screen.findByTestId('family-row-owner');

    expect(screen.queryByTestId('family-share')).not.toBeInTheDocument();
    expect(screen.queryByTestId(/^family-toggle-admin-/)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/^family-remove-/)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/^family-resend-/)).not.toBeInTheDocument();
    expect(screen.getByTestId('family-member-note')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('family-my-alerts-robert@example.com'));
    const panel = await screen.findByTestId('family-my-alerts-panel');
    expect(within(panel).getByTestId('family-alerts-channel-email')).toBeChecked();
    expect(within(panel).getByTestId('family-alerts-channel-push')).toBeChecked();
    expect(within(panel).getByTestId('family-alerts-channel-sms')).not.toBeChecked();
    fireEvent.click(within(panel).getByTestId('family-alerts-channel-push'));
    fireEvent.click(within(panel).getByTestId('family-alerts-type-positive'));
    fireEvent.click(within(panel).getByTestId('family-alerts-save'));
    await waitFor(() =>
      expect(api.updatePerson).toHaveBeenCalledWith('s-ava', 'robert@example.com', {
        receiveAlerts: true,
        alertChannels: ['email'],
        alertTypes: ['missing_assignment', 'deadline', 'grade_drop', 'test', 'workload', 'recommendation'],
      })
    );

    fireEvent.click(screen.getByTestId('family-my-alerts-robert@example.com'));
    fireEvent.click(await screen.findByTestId('family-silence'));
    await waitFor(() =>
      expect(api.updatePerson).toHaveBeenLastCalledWith('s-ava', 'robert@example.com', {
        receiveAlerts: false,
        alertChannels: [],
      })
    );
    expect(await screen.findByTestId('family-notice-robert@example.com')).toHaveTextContent(/silenced/i);

    fireEvent.click(screen.getByTestId('family-leave-robert@example.com'));
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(dialog).toHaveTextContent('Stop following Ava?');
    fireEvent.click(within(dialog).getByTestId('button-confirm-dialog'));
    await waitFor(() => expect(api.leave).toHaveBeenCalledWith('s-ava'));
    expect(onLeft).toHaveBeenCalled();
  });

  it('reloads the list when refreshToken is bumped (the Share dialog just sent an invitation)', async () => {
    api.listPeople.mockResolvedValueOnce([OWNER]).mockResolvedValueOnce([OWNER, PENDING]);
    const { rerender } = render(
      <FamilyCard studentId="s-ava" studentName="Ava" access="owner" viewer={asOwner} refreshToken={0} />
    );
    await screen.findByTestId('family-row-owner');
    expect(api.listPeople).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('family-row-jennifer@example.com')).not.toBeInTheDocument();

    rerender(
      <FamilyCard studentId="s-ava" studentName="Ava" access="owner" viewer={asOwner} refreshToken={1} />
    );
    expect(await screen.findByTestId('family-row-jennifer@example.com')).toBeInTheDocument();
    expect(api.listPeople).toHaveBeenCalledTimes(2);
  });

  it('reports a remove failure under the same row even when the row has neither email nor user id', async () => {
    const malformed: ISharingPerson = { role: 'parent', status: 'pending', isOwner: false, isAdmin: false };
    api.listPeople.mockResolvedValue([OWNER, malformed]);
    api.removePerson.mockRejectedValue(new Error('Contact not found'));
    render(<FamilyCard studentId="s-ava" studentName="Ava" access="owner" viewer={asOwner} />);
    await screen.findByTestId('family-row-1');

    fireEvent.click(screen.getByTestId('family-remove-1'));
    const dialog = await screen.findByTestId('confirm-dialog');
    fireEvent.click(within(dialog).getByTestId('button-confirm-dialog'));
    await waitFor(() => expect(api.removePerson).toHaveBeenCalledWith('s-ava', ''));
    expect(await screen.findByTestId('family-notice-1')).toHaveTextContent('Contact not found');
  });

  it('shows the owner by name for a shared viewer and reports load errors', async () => {
    api.listPeople.mockResolvedValueOnce([OWNER, ROBERT]);
    const { unmount } = render(
      <FamilyCard studentId="s-ava" studentName="Ava" access="member" viewer={asRobert} ownerName="Ricardo" />
    );
    expect(await screen.findByTestId('family-name-owner')).toHaveTextContent('Ricardo');
    unmount();

    api.listPeople.mockRejectedValue(new Error('Student not found'));
    render(<FamilyCard studentId="s-x" studentName="X" access="member" viewer={asRobert} />);
    expect(await screen.findByText('Failed to load people')).toBeInTheDocument();
  });
});
