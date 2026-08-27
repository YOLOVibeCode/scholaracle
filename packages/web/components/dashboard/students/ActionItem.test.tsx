/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ActionItem, formatNudgedAgo } from './ActionItem';
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
  });

  it('formatNudgedAgo uses hours for a 2h window', () => {
    const now = new Date('2026-08-25T18:00:00.000Z');
    expect(formatNudgedAgo('2026-08-25T16:00:00.000Z', now)).toBe('Nudged 2h ago');
  });
});
