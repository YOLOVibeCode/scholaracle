/**
 * The parent's action board and its Nudge button.
 *
 * A nudge that did not go out used to leave the board exactly as it was: the request failed
 * and nothing said so. The board now says why, under the assignment.
 *
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ActionBoard, nudgeFailureMessage } from './ActionBoard';
import { ApiClientError } from '@/lib/api/client';
import { studentsApi, type IActionBoardResponse, type IActionItem } from '@/lib/api/students';

jest.mock('@/lib/api/students', () => ({
  studentsApi: {
    getActionBoard: jest.fn(),
    nudge: jest.fn(),
  },
}));

// The drawer is its own component with its own tests; it stays shut here.
jest.mock('./AssignmentDetailDrawer', () => ({
  AssignmentDetailDrawer: (): null => null,
}));

const mockGetBoard = studentsApi.getActionBoard as jest.Mock;
const mockNudge = studentsApi.nudge as jest.Mock;

const STUDENT = 'student-1';
const CELL = 'demo-emma-ap-bio-a5';
const ESSAY = 'demo-emma-english-essay';

const NO_LOGIN =
  'Emma has no student login to send a nudge to. Create one under Settings, Student logins.';
const NOT_SENT = 'The nudge was not sent. Try again in a moment.';

function item(
  assignmentExternalId: string,
  title: string,
  extra: Partial<IActionItem> = {}
): IActionItem {
  return {
    assignmentExternalId,
    title,
    status: 'missing',
    isOverdue: true,
    course: { externalId: 'demo-emma-ap-bio', name: 'AP Biology', riskLevel: 'none' },
    assets: [],
    materials: [],
    ...extra,
  };
}

function board(cell: Partial<IActionItem> = {}): IActionBoardResponse {
  const items = [item(CELL, 'Cell Division', cell), item(ESSAY, 'Essay draft')];
  return {
    studentId: STUDENT,
    studentName: 'Emma Mitchell',
    buckets: [{ id: 'needs_attention', label: 'Needs attention', count: items.length, items }],
  };
}

async function renderBoard(): Promise<void> {
  render(<ActionBoard studentId={STUDENT} />);
  await screen.findByTestId('action-board');
}

function row(assignmentExternalId: string): HTMLElement {
  return screen.getByTestId(`action-item-${assignmentExternalId}`);
}

function nudgeButton(assignmentExternalId: string): HTMLElement {
  return within(row(assignmentExternalId)).getByTestId('action-item-nudge');
}

describe('ActionBoard nudge', () => {
  beforeEach(() => {
    mockGetBoard.mockReset();
    mockNudge.mockReset();
    mockGetBoard.mockResolvedValue(board());
  });

  it('sends the nudge for the assignment that was pressed and reloads the board', async () => {
    await renderBoard();
    const loadsBefore = mockGetBoard.mock.calls.length;
    const nudgedAt = new Date().toISOString();
    mockNudge.mockResolvedValue({ success: true, lastNudgedAt: nudgedAt });
    mockGetBoard.mockResolvedValue(board({ lastNudgedAt: nudgedAt }));

    fireEvent.click(nudgeButton(CELL));

    expect(await screen.findByTestId('action-item-nudged')).toHaveTextContent('Nudged');
    expect(mockNudge).toHaveBeenCalledTimes(1);
    expect(mockNudge).toHaveBeenCalledWith(STUDENT, CELL);
    expect(mockGetBoard.mock.calls.length).toBeGreaterThan(loadsBefore);
    expect(screen.queryByTestId('action-item-nudge-error')).toBeNull();
  });

  it('says why, under that assignment, when the server refuses the nudge', async () => {
    await renderBoard();
    const loadsBefore = mockGetBoard.mock.calls.length;
    mockNudge.mockRejectedValue(new ApiClientError(NO_LOGIN, 409));

    fireEvent.click(nudgeButton(CELL));

    const message = await within(row(CELL)).findByTestId('action-item-nudge-error');
    expect(message).toHaveTextContent(NO_LOGIN);
    expect(message).toHaveAttribute('role', 'alert');
    // Only the assignment that was pressed carries the message.
    expect(within(row(ESSAY)).queryByTestId('action-item-nudge-error')).toBeNull();
    // Nothing was sent, so the board does not claim a nudge and is not reloaded.
    expect(screen.queryByTestId('action-item-nudged')).toBeNull();
    expect(mockGetBoard.mock.calls.length).toBe(loadsBefore);
    // The parent can try again.
    expect(nudgeButton(CELL)).toBeEnabled();
  });

  it('says the nudge was not sent when the server fails or cannot be reached', async () => {
    await renderBoard();

    mockNudge.mockRejectedValue(new ApiClientError('Internal server error', 500));
    fireEvent.click(nudgeButton(CELL));
    expect(await within(row(CELL)).findByTestId('action-item-nudge-error')).toHaveTextContent(
      NOT_SENT
    );

    mockNudge.mockRejectedValue(new TypeError('Failed to fetch'));
    fireEvent.click(nudgeButton(ESSAY));
    expect(await within(row(ESSAY)).findByTestId('action-item-nudge-error')).toHaveTextContent(
      NOT_SENT
    );
    // One message at a time: the newer press replaces the older one.
    expect(within(row(CELL)).queryByTestId('action-item-nudge-error')).toBeNull();
  });

  it('takes the message away when the parent tries again and it goes out', async () => {
    await renderBoard();
    mockNudge.mockRejectedValueOnce(new ApiClientError('Internal server error', 500));
    fireEvent.click(nudgeButton(CELL));
    await within(row(CELL)).findByTestId('action-item-nudge-error');

    const nudgedAt = new Date().toISOString();
    mockNudge.mockResolvedValue({ success: true, lastNudgedAt: nudgedAt });
    mockGetBoard.mockResolvedValue(board({ lastNudgedAt: nudgedAt }));
    fireEvent.click(nudgeButton(CELL));

    expect(await screen.findByTestId('action-item-nudged')).toBeInTheDocument();
    expect(screen.queryByTestId('action-item-nudge-error')).toBeNull();
  });

  it('cannot be pressed twice while the nudge is on its way', async () => {
    await renderBoard();
    let finish: (value: { success: boolean }) => void = () => undefined;
    mockNudge.mockReturnValue(
      new Promise<{ success: boolean }>((resolve) => {
        finish = resolve;
      })
    );

    fireEvent.click(nudgeButton(CELL));

    await waitFor(() => expect(nudgeButton(CELL)).toBeDisabled());
    fireEvent.click(nudgeButton(CELL));
    expect(mockNudge).toHaveBeenCalledTimes(1);
    // The other assignments stay usable.
    expect(nudgeButton(ESSAY)).toBeEnabled();

    finish({ success: true });
    await waitFor(() => expect(nudgeButton(CELL)).toBeEnabled());
  });
});

describe('nudgeFailureMessage', () => {
  it('passes on what the server said when it refused (4xx): those lines are written for parents', () => {
    expect(nudgeFailureMessage(new ApiClientError(NO_LOGIN, 409))).toBe(NO_LOGIN);
    expect(
      nudgeFailureMessage(new ApiClientError('Already nudged this assignment today', 429))
    ).toBe('Already nudged this assignment today');
    expect(
      nudgeFailureMessage(new ApiClientError('Only the account owner can nudge this student', 403))
    ).toBe('Only the account owner can nudge this student');
  });

  it('uses its own words for a server fault, an outage, or anything that is not a server answer', () => {
    expect(nudgeFailureMessage(new ApiClientError('Internal server error', 500))).toBe(NOT_SENT);
    expect(
      nudgeFailureMessage(new ApiClientError('Nudges are not set up on this server', 503))
    ).toBe(NOT_SENT);
    expect(nudgeFailureMessage(new TypeError('Failed to fetch'))).toBe(NOT_SENT);
    expect(nudgeFailureMessage(new ApiClientError('  ', 409))).toBe(NOT_SENT);
    expect(nudgeFailureMessage(undefined)).toBe(NOT_SENT);
  });
});
