/**
 * The filter bar above a student's workflow table. On a narrow phone (320 px) the two date
 * fields and the dash between them are wider than the screen, so the second field goes under
 * the first.
 * @jest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { WorkflowFilterBar, type WorkflowFilters } from './WorkflowFilterBar';

const NO_FILTERS: WorkflowFilters = {
  courseExternalId: null,
  statuses: [],
  category: null,
  from: null,
  to: null,
};

const classesOf = (element: HTMLElement): string[] => element.className.split(/\s+/);

describe('WorkflowFilterBar', () => {
  it('lets the two date fields wrap', () => {
    render(<WorkflowFilterBar assignments={[]} filters={NO_FILTERS} onFiltersChange={jest.fn()} />);

    const range = screen.getByTestId('workflow-date-range');
    expect(classesOf(range)).toEqual(expect.arrayContaining(['flex', 'flex-wrap']));
    expect(range.querySelectorAll('input[type="date"]')).toHaveLength(2);
  });

  it('still reports a date that was picked', () => {
    const onFiltersChange = jest.fn();
    render(<WorkflowFilterBar assignments={[]} filters={NO_FILTERS} onFiltersChange={onFiltersChange} />);

    fireEvent.change(screen.getByTestId('workflow-date-from'), { target: { value: '2026-11-02' } });
    fireEvent.change(screen.getByTestId('workflow-date-to'), { target: { value: '2026-11-27' } });

    expect(onFiltersChange).toHaveBeenNthCalledWith(1, { ...NO_FILTERS, from: '2026-11-02' });
    expect(onFiltersChange).toHaveBeenNthCalledWith(2, { ...NO_FILTERS, to: '2026-11-27' });
  });
});
