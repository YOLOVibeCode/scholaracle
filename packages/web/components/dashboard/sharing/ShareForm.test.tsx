/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ShareForm } from './ShareForm';
import { sharingApi } from '@/lib/api/sharing';

jest.mock('@/lib/api/sharing', () => ({
  sharingApi: { invite: jest.fn() },
}));

const inviteMock = sharingApi.invite as jest.MockedFunction<typeof sharingApi.invite>;

const STUDENTS = [
  { id: 's-ava', name: 'Ava' },
  { id: 's-chris', name: 'Christian' },
  { id: 's-gid', name: 'Gideon' },
];

describe('ShareForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defaults: email and push on, text off, the given student pre-ticked, label parent', () => {
    render(<ShareForm students={STUDENTS} defaultStudentIds={['s-chris']} />);
    expect(screen.getByTestId('share-channel-email')).toBeChecked();
    expect(screen.getByTestId('share-channel-push')).toBeChecked();
    expect(screen.getByTestId('share-channel-sms')).not.toBeChecked();
    expect(screen.getByTestId('share-student-s-chris')).toBeChecked();
    expect(screen.getByTestId('share-student-s-ava')).not.toBeChecked();
    expect(screen.getByTestId('share-label')).toHaveValue('parent');
    expect(screen.getByTestId('share-admin')).toHaveAttribute('data-state', 'unchecked');
  });

  it('requires an email, a student and a phone when texts are on', async () => {
    render(<ShareForm students={STUDENTS} />);
    fireEvent.submit(screen.getByTestId('share-form'));
    expect(await screen.findByTestId('share-error')).toHaveTextContent(/email/i);

    fireEvent.change(screen.getByTestId('share-email'), { target: { value: 'jessica@example.com' } });
    fireEvent.submit(screen.getByTestId('share-form'));
    expect(await screen.findByTestId('share-error')).toHaveTextContent(/at least one student/i);

    fireEvent.click(screen.getByTestId('share-student-s-ava'));
    fireEvent.click(screen.getByTestId('share-channel-sms'));
    expect(screen.getByTestId('share-sms-needs-phone')).toBeInTheDocument();
    fireEvent.submit(screen.getByTestId('share-form'));
    expect(await screen.findByTestId('share-error')).toHaveTextContent(/phone/i);
    expect(inviteMock).not.toHaveBeenCalled();
  });

  it('sends one invitation for every ticked student and shows the per-student outcome', async () => {
    inviteMock.mockResolvedValue({
      inviteGroupId: 'grp-1',
      perStudent: [
        { studentId: 's-ava', status: 'invited' },
        { studentId: 's-chris', status: 'already_invited' },
        { studentId: 's-gid', status: 'already_accepted' },
      ],
    });
    const onSent = jest.fn();
    render(<ShareForm students={STUDENTS} onSent={onSent} />);

    fireEvent.change(screen.getByTestId('share-email'), { target: { value: ' Jessica@example.com ' } });
    fireEvent.change(screen.getByTestId('share-name'), { target: { value: 'Jessica' } });
    fireEvent.change(screen.getByTestId('share-label'), { target: { value: 'guardian' } });
    fireEvent.click(screen.getByTestId('share-admin'));
    for (const id of ['s-ava', 's-chris', 's-gid']) {
      fireEvent.click(screen.getByTestId(`share-student-${id}`));
    }
    fireEvent.submit(screen.getByTestId('share-form'));

    await waitFor(() => expect(inviteMock).toHaveBeenCalledTimes(1));
    expect(inviteMock).toHaveBeenCalledWith({
      email: 'Jessica@example.com',
      label: 'guardian',
      studentIds: ['s-ava', 's-chris', 's-gid'],
      alertChannels: ['email', 'push'],
      name: 'Jessica',
      isAdmin: true,
    });
    expect(await screen.findByTestId('share-result')).toBeInTheDocument();
    expect(screen.getByTestId('share-result-s-ava')).toHaveTextContent('Invitation sent');
    expect(screen.getByTestId('share-result-s-chris')).toHaveTextContent('Already invited');
    expect(screen.getByTestId('share-result-s-gid')).toHaveTextContent('Already has access');
    expect(screen.queryByTestId('share-sms-link')).not.toBeInTheDocument();
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('shows the SMS opt-in link with a copy button and the consent sentence', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    inviteMock.mockResolvedValue({
      inviteGroupId: 'grp-2',
      perStudent: [{ studentId: 's-ava', status: 'invited' }],
      smsOptInUrl: 'http://localhost:2800/sms/optin/tok-1',
    });
    render(<ShareForm students={[STUDENTS[0]!]} />);

    fireEvent.change(screen.getByTestId('share-email'), { target: { value: 'robert@example.com' } });
    fireEvent.change(screen.getByTestId('share-phone'), { target: { value: '+1 555 000 0000' } });
    fireEvent.click(screen.getByTestId('share-channel-sms'));
    fireEvent.submit(screen.getByTestId('share-form'));

    expect(await screen.findByTestId('share-sms-link')).toHaveValue('http://localhost:2800/sms/optin/tok-1');
    expect(screen.getByText(/opt in to texts themselves/i)).toBeInTheDocument();
    expect(inviteMock.mock.calls[0]![0]).toMatchObject({
      phone: '+1 555 000 0000',
      alertChannels: ['email', 'push', 'sms'],
      studentIds: ['s-ava'],
    });

    fireEvent.click(screen.getByTestId('share-copy-link'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://localhost:2800/sms/optin/tok-1'));
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('requires at least one channel so the person can be reached', async () => {
    render(<ShareForm students={[STUDENTS[0]!]} />);
    fireEvent.change(screen.getByTestId('share-email'), { target: { value: 'x@example.com' } });
    fireEvent.click(screen.getByTestId('share-channel-email'));
    fireEvent.click(screen.getByTestId('share-channel-push'));
    fireEvent.submit(screen.getByTestId('share-form'));
    expect(await screen.findByTestId('share-error')).toHaveTextContent(/at least one way to reach/i);
    expect(inviteMock).not.toHaveBeenCalled();
  });

  it('surfaces an API error and keeps the form', async () => {
    inviteMock.mockRejectedValue(new Error('Only an owner or admin can share this student'));
    render(<ShareForm students={[STUDENTS[0]!]} />);
    fireEvent.change(screen.getByTestId('share-email'), { target: { value: 'x@example.com' } });
    fireEvent.submit(screen.getByTestId('share-form'));
    expect(await screen.findByTestId('share-error')).toHaveTextContent(/owner or admin/);
    expect(screen.getByTestId('share-form')).toBeInTheDocument();
  });
});
