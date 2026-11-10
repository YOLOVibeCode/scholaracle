/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { StudentGradeStripRow } from './StudentGradeStripRow';

const base = { id: 's-ava', userId: 'u-owner', name: 'Ava', grade: '10', peopleCount: 1 };

describe('StudentGradeStripRow sharing badge', () => {
  it('shows "Shared with you · by <inviter>" from the list item itself', () => {
    render(
      <StudentGradeStripRow
        student={{
          ...base,
          access: 'member',
          peopleCount: 3,
          invitedBy: { userId: 'u-owner', name: 'Ricardo' },
        }}
        grades={null}
      />
    );
    expect(screen.getByTestId('shared-with-you')).toHaveTextContent('Shared with you · by Ricardo');
  });

  it('still shows the badge without an inviter name, and never for the owner', () => {
    const { rerender } = render(
      <StudentGradeStripRow
        student={{ ...base, access: 'admin', peopleCount: 2, invitedBy: { userId: 'u-owner' } }}
        grades={null}
      />
    );
    expect(screen.getByTestId('shared-with-you')).toHaveTextContent(/^Shared with you$/);

    rerender(<StudentGradeStripRow student={{ ...base, access: 'owner' }} grades={null} />);
    expect(screen.queryByTestId('shared-with-you')).not.toBeInTheDocument();
  });
});
