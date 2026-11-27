/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import type { ReactElement, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { agendaApi, type IAgendaItem } from '@/lib/api/agenda';
import { ApiClientError } from '@/lib/api/client';
import { AgendaCard } from './AgendaCard';

jest.mock('@/lib/api/agenda', () => ({
  agendaApi: { sendReminder: jest.fn() },
}));

// How the menu opens and closes is not under test here: its items are always on the page.
jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }): ReactElement => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }): ReactElement => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }): ReactElement => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
    'data-testid': testId,
  }: {
    children: ReactNode;
    onClick?: () => void;
    'data-testid'?: string;
  }): ReactElement => (
    <button type="button" onClick={onClick} data-testid={testId}>
      {children}
    </button>
  ),
}));

const sendReminder = agendaApi.sendReminder as jest.Mock;

const ITEM: IAgendaItem = {
  id: 'assignment:essay-1',
  title: 'History essay',
  timeAt: '2026-12-01T17:00:00.000Z',
  studentName: 'Emma',
  courseName: 'History',
};

const minutesAgo = (minutes: number): string =>
  new Date(Date.now() - minutes * 60_000).toISOString();

function renderCard(item: IAgendaItem = ITEM): { readonly onReminderSent: jest.Mock } {
  const onReminderSent = jest.fn();
  render(<AgendaCard item={item} onSnooze={jest.fn()} onReminderSent={onReminderSent} />);
  return { onReminderSent };
}

describe('AgendaCard reminders', () => {
  beforeEach(() => {
    sendReminder.mockReset();
  });

  it('says a reminder was sent, and offers no second one, when one went out', () => {
    renderCard({ ...ITEM, reminders: [{ channel: 'sms', sentAt: minutesAgo(5), status: 'sent' }] });

    expect(screen.getByTestId('agenda-reminder-badge')).toHaveTextContent('SMS sent 5m ago');
    expect(screen.queryByTestId('agenda-send-reminder')).not.toBeInTheDocument();
  });

  it('does not say "sent" for a reminder that failed, and still offers to send one', () => {
    renderCard({
      ...ITEM,
      reminders: [{ channel: 'sms', sentAt: minutesAgo(5), status: 'failed' }],
    });

    expect(screen.queryByTestId('agenda-reminder-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('agenda-send-reminder')).toBeInTheDocument();
  });

  it('shows the reminder that went out, not the failed attempt after it', () => {
    renderCard({
      ...ITEM,
      reminders: [
        { channel: 'sms', sentAt: minutesAgo(2), status: 'failed' },
        { channel: 'email', sentAt: minutesAgo(30), status: 'delivered' },
      ],
    });

    expect(screen.getByTestId('agenda-reminder-badge')).toHaveTextContent('EMAIL sent 30m ago');
  });

  it('tells the page a reminder went out, and shows no message', async () => {
    sendReminder.mockResolvedValue({ success: true });
    const { onReminderSent } = renderCard();

    fireEvent.click(screen.getByTestId('agenda-remind-sms'));

    await waitFor(() => expect(onReminderSent).toHaveBeenCalledTimes(1));
    expect(sendReminder).toHaveBeenCalledWith({
      itemId: 'assignment:essay-1',
      channel: 'sms',
      title: 'History essay',
      studentName: 'Emma',
      courseName: 'History',
      timeAt: '2026-12-01T17:00:00.000Z',
    });
    expect(screen.queryByTestId('agenda-reminder-error')).not.toBeInTheDocument();
  });

  it('says why, in the server’s words, when the reminder was refused', async () => {
    sendReminder.mockRejectedValue(
      new ApiClientError(
        'Texts are not turned on for your number. Turn on text alerts in Settings first.',
        409
      )
    );
    const { onReminderSent } = renderCard();

    fireEvent.click(screen.getByTestId('agenda-remind-sms'));

    const message = await screen.findByTestId('agenda-reminder-error');
    expect(message).toHaveTextContent(
      'Texts are not turned on for your number. Turn on text alerts in Settings first.'
    );
    expect(message).toHaveAttribute('role', 'alert');
    expect(onReminderSent).not.toHaveBeenCalled();
    // The button is back, so the person can try the other channel.
    expect(screen.getByTestId('agenda-send-reminder')).toBeEnabled();
  });

  it('says the reminder was not sent when the answer says so without a reason', async () => {
    sendReminder.mockResolvedValue({ success: false });
    const { onReminderSent } = renderCard();

    fireEvent.click(screen.getByTestId('agenda-remind-email'));

    expect(await screen.findByTestId('agenda-reminder-error')).toHaveTextContent(
      'The reminder could not be sent. Try again later.'
    );
    expect(onReminderSent).not.toHaveBeenCalled();
  });

  it('does not show what an unexpected error says', async () => {
    sendReminder.mockRejectedValue(new TypeError("Cannot read properties of undefined ('x')"));
    renderCard();

    fireEvent.click(screen.getByTestId('agenda-remind-sms'));

    expect(await screen.findByTestId('agenda-reminder-error')).toHaveTextContent(
      'The reminder could not be sent. Try again later.'
    );
  });

  it('clears the message when the next try goes out', async () => {
    sendReminder.mockRejectedValueOnce(new ApiClientError('Too many texts to this number.', 429));
    sendReminder.mockResolvedValueOnce({ success: true });
    const { onReminderSent } = renderCard();

    fireEvent.click(screen.getByTestId('agenda-remind-sms'));
    await screen.findByTestId('agenda-reminder-error');
    fireEvent.click(screen.getByTestId('agenda-remind-email'));

    await waitFor(() => expect(onReminderSent).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('agenda-reminder-error')).not.toBeInTheDocument();
  });
});
