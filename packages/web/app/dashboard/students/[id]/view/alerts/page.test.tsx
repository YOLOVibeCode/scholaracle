/**
 * The student's alerts ("view as student") on a narrow screen: the same card as the Alerts page,
 * with an icon. A type that is one long word must not push the button off the screen.
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import StudentViewAlertsPage from './page';
import { alertsApi, type IAlert } from '@/lib/api/alerts';

jest.mock('@/lib/api/alerts', () => ({
  alertsApi: { getAll: jest.fn(), acknowledge: jest.fn() },
}));
jest.mock('@/lib/contexts/StudentViewContext', () => ({
  useStudentView: () => ({ studentExternalId: 'stu-1' }),
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

describe('StudentViewAlertsPage on a narrow screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAllMock.mockResolvedValue([alert('alert-1', false), alert('alert-2', true)]);
  });

  it('lets the Acknowledge button go under the text when the two do not fit side by side', async () => {
    render(<StudentViewAlertsPage />);

    const row = await screen.findByTestId('alert-row');
    expect(classesOf(row)).toContain('flex-wrap');
    expect(row.contains(screen.getByTestId('button-acknowledge'))).toBe(true);

    const text = screen.getByTestId('alert-text');
    expect(classesOf(text)).toEqual(expect.arrayContaining(['min-w-0', 'flex-1', 'basis-48']));
    expect(text.contains(screen.getByTestId('button-acknowledge'))).toBe(false);
  });

  it('lets a long type break, and the badges go to the next line, in both lists', async () => {
    render(<StudentViewAlertsPage />);

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
    render(<StudentViewAlertsPage />);

    await screen.findByTestId('alert-row');
    expect(classesOf(screen.getByTestId('alert-filters'))).toContain('flex-wrap');
  });
});
