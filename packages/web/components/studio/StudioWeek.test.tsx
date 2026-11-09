/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { IWeekView, StudentStatus } from '@scholaracle/contracts';
import { apiClient } from '@/lib/api/client';
import { StudioWeek } from './StudioWeek';

const refresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh }),
}));

jest.mock('@/lib/api/client', () => ({
  apiClient: { request: jest.fn().mockResolvedValue({ success: true }) },
}));

jest.mock('./WeekView', () => ({
  WeekView: ({
    view,
    onStatusChange,
  }: {
    view: IWeekView;
    onStatusChange?: (id: string, status: StudentStatus, note?: string) => Promise<void>;
  }) => (
    <div>
      <span data-testid="owed-count">{view.counts.owed}</span>
      <span data-testid="done-count">{view.counts.done}</span>
      <span data-testid="first-status">{view.owed[0]?.studentStatus ?? 'none'}</span>
      <button
        type="button"
        onClick={() => void onStatusChange?.('a1', 'done')?.catch(() => undefined)}
      >
        done
      </button>
      <button type="button" onClick={() => void onStatusChange?.('a1', 'need_help', 'stuck on 7')}>
        help
      </button>
      <button type="button" onClick={() => void onStatusChange?.('a1', 'working_on_it', '')}>
        working
      </button>
    </div>
  ),
}));

const VIEW: IWeekView = {
  encouragement: "Let's take the next step.",
  owed: [
    {
      assignmentExternalId: 'a1',
      title: 'Ch. 4 worksheet',
      courseName: 'Math',
      humanStatus: 'Not turned in',
      studentStatus: 'not_started',
      needs: [],
      primaryCtaLabel: 'Open worksheet',
    },
  ],
  days: [],
  doneThisWeek: [],
  counts: { owed: 1, due: 0, done: 0 },
};

describe('StudioWeek', () => {
  beforeEach(() => {
    (apiClient.request as jest.Mock).mockClear();
    refresh.mockClear();
  });

  it('done moves the item locally, PATCHes, then refreshes the page data', async () => {
    render(<StudioWeek view={VIEW} />);
    expect(screen.getByTestId('owed-count')).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: 'done' }));
    expect(screen.getByTestId('owed-count')).toHaveTextContent('0');
    expect(screen.getByTestId('done-count')).toHaveTextContent('1');
    expect(apiClient.request).toHaveBeenCalledWith(
      '/studio/assignments/a1/status',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'done' }) })
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('need help sends the note; an empty note is left off the wire', async () => {
    render(<StudioWeek view={VIEW} />);
    fireEvent.click(screen.getByRole('button', { name: 'help' }));
    expect(screen.getByTestId('first-status')).toHaveTextContent('need_help');
    fireEvent.click(screen.getByRole('button', { name: 'working' }));
    expect(screen.getByTestId('first-status')).toHaveTextContent('working_on_it');
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    const bodies = (apiClient.request as jest.Mock).mock.calls.map(
      (c: [string, { body: string }]) => JSON.parse(c[1].body)
    );
    expect(bodies).toEqual([
      { status: 'need_help', note: 'stuck on 7' },
      { status: 'working_on_it' },
    ]);
  });

  it('a failed PATCH puts the row back and surfaces the error to the sheet', async () => {
    (apiClient.request as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    render(<StudioWeek view={VIEW} />);
    fireEvent.click(screen.getByRole('button', { name: 'done' }));
    expect(screen.getByTestId('owed-count')).toHaveTextContent('0');
    await waitFor(() => expect(screen.getByTestId('owed-count')).toHaveTextContent('1'));
    expect(screen.getByTestId('done-count')).toHaveTextContent('0');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('a fresh server view replaces the optimistic copy', () => {
    const { rerender } = render(<StudioWeek view={VIEW} />);
    fireEvent.click(screen.getByRole('button', { name: 'done' }));
    expect(screen.getByTestId('owed-count')).toHaveTextContent('0');
    rerender(<StudioWeek view={{ ...VIEW, counts: { owed: 1, due: 0, done: 0 } }} />);
    expect(screen.getByTestId('owed-count')).toHaveTextContent('1');
  });
});
