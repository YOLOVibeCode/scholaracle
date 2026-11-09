/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { IStudentStatusUpdateResponse, IWeekItem, IWeekView } from '@scholaracle/contracts';
import { WeekView } from './WeekView';

jest.mock('next/link', () => {
  return function MockLink({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  };
});

function item(id: string, overrides: Partial<IWeekItem> = {}): IWeekItem {
  return {
    assignmentExternalId: id,
    title: `Title ${id}`,
    courseName: 'Math',
    humanStatus: 'Coming up',
    studentStatus: 'not_started',
    needs: [],
    primaryCtaLabel: 'Open worksheet',
    ...overrides,
  };
}

const VIEW: IWeekView = {
  encouragement: 'You finished 4 things. Nice.',
  owed: [
    item('ch4', {
      title: 'Ch. 4 worksheet',
      humanStatus: 'Not turned in',
      dueAt: '2026-11-03T16:00:00.000Z',
      needs: ['saved_file'],
      warning: 'Marked done, but the school shows not turned in',
    }),
  ],
  days: [
    {
      date: '2026-11-09',
      label: 'Today',
      items: [
        item('essay', {
          title: 'Essay draft',
          courseName: 'English',
          humanStatus: 'Due soon',
          needs: ['school_login'],
        }),
      ],
    },
    { date: '2026-11-10', label: 'Tomorrow', items: [] },
    {
      date: '2026-11-11',
      label: 'Wed',
      items: [
        item('ch5', {
          title: 'Ch. 5 problems',
          studentStatus: 'working_on_it',
          needs: ['saved_file', 'internet'],
        }),
      ],
    },
  ],
  doneThisWeek: [
    { assignmentExternalId: 'd1', title: 'Quiz 3', courseName: 'Math', confirmedBySchool: true },
    {
      assignmentExternalId: 'd2',
      title: 'Reading log',
      courseName: 'English',
      confirmedBySchool: false,
    },
  ],
  counts: { owed: 1, due: 2, done: 2 },
};

function accepted(
  extra: Partial<IStudentStatusUpdateResponse> = {}
): jest.Mock<Promise<IStudentStatusUpdateResponse>> {
  return jest.fn().mockResolvedValue({ success: true, studentStatus: 'need_help', ...extra });
}

async function openNeedHelp(id: string): Promise<void> {
  fireEvent.click(screen.getByTestId(`studio-week-status-${id}`));
  fireEvent.click(await screen.findByTestId('status-option-need_help'));
}

describe('WeekView', () => {
  it('renders Still owed, only the days with work, and Done this week, with glyphs and no scores', async () => {
    render(<WeekView view={VIEW} />);
    expect(screen.getByTestId('studio-encouragement')).toHaveTextContent(
      'You finished 4 things. Nice.'
    );
    expect(screen.getByTestId('studio-week-summary')).toHaveTextContent(
      '2 due · 1 still owed · you finished 2'
    );
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Still owed', 'Today', 'Wed', 'Done this week (2)']);
    expect(screen.queryByText('Tomorrow')).not.toBeInTheDocument();

    const owed = screen.getByTestId('studio-week-owed');
    expect(within(owed).getByRole('link', { name: 'Ch. 4 worksheet' })).toHaveAttribute(
      'href',
      '/studio/assignments/ch4'
    );
    expect(owed).toHaveTextContent('Not turned in');
    // Due dates appear after mount, in a fixed en-US shape (16:00Z on Nov 3 is Nov 3 in any US zone).
    await waitFor(() => expect(owed).toHaveTextContent(/Due Nov [34]/));
    expect(owed).toHaveTextContent('📄 saved');
    expect(screen.getByTestId('studio-week-warning')).toHaveTextContent(
      'Marked done, but the school shows not turned in'
    );

    const wed = screen.getByTestId('studio-week-day-2026-11-11');
    expect(wed).toHaveTextContent('🌐 needs internet');
    expect(wed).toHaveTextContent('📄 saved');
    expect(wed).toHaveTextContent('Working on it');
    expect(wed).not.toHaveTextContent(/Due /);
    expect(screen.getByTestId('studio-week-day-2026-11-09')).toHaveTextContent('🔒 school login');

    const done = screen.getByTestId('studio-week-done');
    expect(done).toHaveTextContent('Quiz 3');
    expect(done).toHaveTextContent('Turned in');
    expect(done).toHaveTextContent('Marked done');
    expect(screen.getByTestId('studio-tab-today')).toHaveAttribute('href', '/studio');
    expect(screen.getByTestId('studio-tab-week')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByTestId('studio-week-empty')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d+\s*%/);
  });

  it("says You're caught up. when nothing is owed or due", () => {
    render(
      <WeekView
        view={{
          encouragement: "You're caught up.",
          owed: [],
          days: VIEW.days.map((d) => ({ ...d, items: [] })),
          doneThisWeek: VIEW.doneThisWeek,
          counts: { owed: 0, due: 0, done: 2 },
        }}
      />
    );
    expect(screen.getByTestId('studio-week-empty')).toHaveTextContent("You're caught up.");
    expect(screen.queryByTestId('studio-week-owed')).not.toBeInTheDocument();
    expect(screen.getByTestId('studio-week-done')).toBeInTheDocument();
  });

  it('renders status as plain text without a handler, and as a button with one', () => {
    const { unmount } = render(<WeekView view={VIEW} />);
    expect(screen.queryByTestId('studio-week-status-ch4')).not.toBeInTheDocument();
    expect(screen.getByTestId('studio-week-owed')).toHaveTextContent('Not started');
    unmount();
    render(<WeekView view={VIEW} onStatusChange={accepted()} />);
    expect(
      screen.getByRole('button', { name: 'Status: Not started. Change status for Ch. 4 worksheet' })
    ).toBeInTheDocument();
  });

  it('picking Working on it submits at once and closes the sheet', async () => {
    const onStatusChange = accepted({ studentStatus: 'working_on_it' });
    render(<WeekView view={VIEW} onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByTestId('studio-week-status-essay'));
    const sheet = await screen.findByTestId('status-sheet');
    expect(sheet).toHaveTextContent('Essay draft');
    expect(screen.getByTestId('status-option-not_started')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('status-option-working_on_it'));
    await waitFor(() =>
      expect(onStatusChange).toHaveBeenCalledWith('essay', 'working_on_it', undefined)
    );
    await waitFor(() => expect(screen.queryByTestId('status-sheet')).not.toBeInTheDocument());
  });

  it('ignores Escape and Cancel while a save is in flight, then closes on its own', async () => {
    let finish: (value: IStudentStatusUpdateResponse) => void = () => undefined;
    const onStatusChange = jest.fn(
      () =>
        new Promise<IStudentStatusUpdateResponse>((resolve) => {
          finish = resolve;
        })
    );
    render(<WeekView view={VIEW} onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByTestId('studio-week-status-essay'));
    const sheet = await screen.findByTestId('status-sheet');
    fireEvent.click(screen.getByTestId('status-option-working_on_it'));
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(sheet, { key: 'Escape', code: 'Escape' });
    expect(screen.getByTestId('status-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('status-option-done')).toBeDisabled();
    finish({ success: true, studentStatus: 'working_on_it' });
    await waitFor(() => expect(screen.queryByTestId('status-sheet')).not.toBeInTheDocument());
  });

  it('Need help: note is capped at 140 UTF-16 units with a counter, trimmed on send', async () => {
    const onStatusChange = accepted({ notified: true });
    render(<WeekView view={VIEW} onStatusChange={onStatusChange} />);
    await openNeedHelp('ch5');
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('status-sheet-note')).toHaveTextContent(
      'Tell your grown-ups you\'re stuck on "Ch. 5 problems".'
    );
    expect(screen.getByTestId('need-help-counter')).toHaveTextContent('0/140');
    const field = screen.getByTestId('need-help-note') as HTMLTextAreaElement;
    expect(field).toHaveAttribute('maxlength', '140');
    fireEvent.change(field, { target: { value: `  ${'x'.repeat(150)}  ` } });
    expect(field.value).toHaveLength(140);
    expect(screen.getByTestId('need-help-counter')).toHaveTextContent('140/140');
    // An emoji is two UTF-16 units, the same unit the textarea's maxLength counts.
    fireEvent.change(field, { target: { value: '😀😀' } });
    expect(screen.getByTestId('need-help-counter')).toHaveTextContent('4/140');
    fireEvent.change(field, { target: { value: `${'😀'.repeat(70)}😀` } });
    expect(field.value).toBe('😀'.repeat(70));
    expect(screen.getByTestId('need-help-counter')).toHaveTextContent('140/140');
    fireEvent.change(field, { target: { value: " I don't get #7 " } });
    expect(screen.getByTestId('need-help-counter')).toHaveTextContent('16/140');
    fireEvent.click(screen.getByTestId('need-help-send'));
    await waitFor(() =>
      expect(onStatusChange).toHaveBeenCalledWith('ch5', 'need_help', "I don't get #7")
    );
  });

  it('says the grown-ups were told only when the server says notified: true', async () => {
    render(<WeekView view={VIEW} onStatusChange={accepted({ notified: true })} />);
    await openNeedHelp('ch5');
    fireEvent.click(screen.getByTestId('need-help-send'));
    expect(await screen.findByTestId('need-help-outcome')).toHaveTextContent(
      'Your grown-ups were told'
    );
    fireEvent.click(screen.getByTestId('need-help-ok'));
    await waitFor(() => expect(screen.queryByTestId('status-sheet')).not.toBeInTheDocument());
  });

  it('says they already know when the server rate-limited (notified: false)', async () => {
    render(
      <WeekView
        view={VIEW}
        onStatusChange={accepted({ notified: false, nextAllowedAt: '2026-11-10T18:00:00.000Z' })}
      />
    );
    await openNeedHelp('ch5');
    fireEvent.click(screen.getByTestId('need-help-send'));
    expect(await screen.findByTestId('need-help-outcome')).toHaveTextContent(
      'You already asked today. Your grown-ups know.'
    );
    expect(screen.getByTestId('status-sheet-sent')).not.toHaveTextContent('were told');
  });

  it('claims only a save when an older server never says notified', async () => {
    render(<WeekView view={VIEW} onStatusChange={accepted()} />);
    await openNeedHelp('ch5');
    fireEvent.click(screen.getByTestId('need-help-send'));
    expect(await screen.findByTestId('need-help-outcome')).toHaveTextContent(
      'Saved. Your grown-ups will see this on your list.'
    );
  });

  it('a blank note is not sent; a failed save keeps the sheet open with an error', async () => {
    const onStatusChange = jest.fn().mockRejectedValue(new Error('offline'));
    render(<WeekView view={VIEW} onStatusChange={onStatusChange} />);
    await openNeedHelp('ch5');
    fireEvent.change(screen.getByTestId('need-help-note'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('need-help-send'));
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('ch5', 'need_help', undefined));
    expect(await screen.findByTestId('status-sheet-error')).toHaveTextContent(
      "Couldn't save that. Try again."
    );
    expect(screen.getByTestId('status-sheet-note')).toBeInTheDocument();
  });
});
