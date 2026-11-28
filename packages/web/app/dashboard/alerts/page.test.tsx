/**
 * The Alerts page on a narrow screen: a card whose title is one long word (the alert's type)
 * must not push its Acknowledge button off the screen.
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import AlertsPage from './page';
import { alertsApi, type IAlert } from '@/lib/api/alerts';

jest.mock('@/lib/api/alerts', () => ({
  alertsApi: { getAll: jest.fn(), acknowledge: jest.fn() },
}));

const getAllMock = alertsApi.getAll as jest.MockedFunction<typeof alertsApi.getAll>;

function alert(id: string, acknowledged: boolean): IAlert {
  return {
    id,
    studentId: 'stu-1',
    type: 'MISSING_ASSIGNMENT',
    severity: 'warning',
    message: 'Math homework due tomorrow',
    createdAt: '2026-11-27T15:00:00.000Z',
    acknowledged,
  };
}

const classesOf = (element: HTMLElement): string[] => element.className.split(/\s+/);

describe('AlertsPage on a narrow screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAllMock.mockResolvedValue([alert('alert-1', false), alert('alert-2', true)]);
  });

  it('lets the Acknowledge button go under the text when the two do not fit side by side', async () => {
    render(<AlertsPage />);

    const row = await screen.findByTestId('alert-row');
    expect(classesOf(row)).toContain('flex-wrap');
    expect(row.contains(screen.getByTestId('button-acknowledge'))).toBe(true);
  });

  it('gives the text a line of its own before it is squeezed', async () => {
    render(<AlertsPage />);

    const text = await screen.findByTestId('alert-text');
    expect(classesOf(text)).toEqual(expect.arrayContaining(['min-w-0', 'flex-1', 'basis-48']));
    expect(text.contains(screen.getByTestId('button-acknowledge'))).toBe(false);

  });

  // A flex item is never narrower than its longest word unless it may be (min-w-0); only then
  // does the word break.
  it('lets a long type break, and the badges go to the next line, in both lists', async () => {
    render(<AlertsPage />);

    await screen.findByTestId('alert-row');
    const titles = screen.getAllByText('MISSING_ASSIGNMENT');
    expect(titles).toHaveLength(2);
    for (const title of titles) {
      expect(classesOf(title)).toEqual(expect.arrayContaining(['min-w-0', 'break-words']));
      expect(classesOf(title.parentElement as HTMLElement)).toContain('flex-wrap');
    }
    expect(classesOf(screen.getByTestId('alert-text-acknowledged'))).toContain('min-w-0');
  });

  it('lets the filter buttons wrap', async () => {
    render(<AlertsPage />);

    await screen.findByTestId('alert-row');
    expect(classesOf(screen.getByTestId('alert-filters'))).toContain('flex-wrap');
  });
});
