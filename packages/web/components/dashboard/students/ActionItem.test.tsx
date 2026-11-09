/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ActionItem, formatAskedForHelpAgo, formatNudgedAgo } from './ActionItem';
import type { IActionItem } from '@/lib/api/students';

const ITEM: IActionItem = {
  assignmentExternalId: 'demo-emma-ap-bio-a5',
  title: 'Cell Division',
  status: 'missing',
  isOverdue: false,
  course: { externalId: 'demo-emma-ap-bio', name: 'AP Biology', riskLevel: 'none' },
  assets: [],
  materials: [],
};

describe('ActionItem nudge', () => {
  it('shows Nudged 2h ago and disables the button until the window resets', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    render(
      <ActionItem
        item={{ ...ITEM, lastNudgedAt: twoHoursAgo, studentStatus: 'working_on_it' }}
        onNudge={jest.fn()}
      />
    );
    expect(screen.getByTestId('action-item-nudged')).toHaveTextContent('Nudged 2h ago');
    expect(screen.getByTestId('action-item-working')).toHaveTextContent('Working on it');
    expect(screen.getByTestId('action-item-nudge')).toBeDisabled();
  });

  it('calls onNudge without treating working_on_it as submitted', () => {
    const onNudge = jest.fn();
    render(<ActionItem item={ITEM} onNudge={onNudge} />);
    fireEvent.click(screen.getByTestId('action-item-nudge'));
    expect(onNudge).toHaveBeenCalledWith(ITEM);
    expect(screen.getByText('missing')).toBeInTheDocument();
    expect(screen.getByTestId('action-item-nudge')).toHaveTextContent('Nudge');
    expect(screen.queryByTestId('action-item-needs-help')).toBeNull();
  });

  it('formatNudgedAgo uses hours for a 2h window', () => {
    const now = new Date('2026-08-25T18:00:00.000Z');
    expect(formatNudgedAgo('2026-08-25T16:00:00.000Z', now)).toBe('Nudged 2h ago');
  });
});

describe('ActionItem need_help (student review R3)', () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const asking: IActionItem = {
    ...ITEM,
    status: 'not_started',
    studentStatus: 'need_help',
    askedForHelpAt: twoHoursAgo,
    studentNote: "I don't get #7",
  };

  it('shows "Asked for help 2 h ago", the note, and relabels the button "Reply with a nudge"', () => {
    const onNudge = jest.fn();
    render(<ActionItem item={asking} onNudge={onNudge} />);
    expect(screen.getByTestId('action-item-needs-help')).toHaveTextContent('Asked for help 2 h ago');
    expect(screen.getByTestId('action-item-student-note')).toHaveTextContent("I don't get #7");
    const button = screen.getByTestId('action-item-nudge');
    expect(button).toHaveTextContent('Reply with a nudge');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onNudge).toHaveBeenCalledWith(asking);
  });

  it('shows a plain "Asked for help" without a time or note when the server sent neither', () => {
    render(<ActionItem item={{ ...ITEM, studentStatus: 'need_help' }} />);
    expect(screen.getByTestId('action-item-needs-help')).toHaveTextContent('Asked for help');
    expect(screen.queryByTestId('action-item-student-note')).toBeNull();
    expect(screen.queryByTestId('action-item-nudge')).toBeNull();
  });

  it('formatAskedForHelpAgo uses minutes, hours, then days', () => {
    const now = new Date('2026-11-09T18:00:00.000Z');
    expect(formatAskedForHelpAgo('2026-11-09T17:45:00.000Z', now)).toBe('Asked for help 15 min ago');
    expect(formatAskedForHelpAgo('2026-11-09T16:00:00.000Z', now)).toBe('Asked for help 2 h ago');
    expect(formatAskedForHelpAgo('2026-11-06T18:00:00.000Z', now)).toBe('Asked for help 3 d ago');
  });
});
