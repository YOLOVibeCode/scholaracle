/**
 * Unit tests for AllCoursesGradeTrend: pivot logic, component rendering, error/retry. TDD/ISP.
 * @jest-environment jsdom
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AllCoursesGradeTrend, pivotToChartData } from './AllCoursesGradeTrend';
import type { IGradeHistoryResponse } from '@/lib/api/students';

jest.mock('@/lib/api/students', () => ({
  studentsApi: {
    getGradeHistory: jest.fn(),
  },
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- need mocked module reference after jest.mock()
const studentsApi = require('@/lib/api/students').studentsApi as { getGradeHistory: jest.Mock };

describe('pivotToChartData', () => {
  it('returns empty rows and courseOrder when no courses', () => {
    const res: IGradeHistoryResponse = { studentId: 's1', courses: [] };
    const { rows, courseOrder } = pivotToChartData(res);
    expect(rows).toEqual([]);
    expect(courseOrder).toEqual([]);
  });

  it('pivots one course with two snapshots into two rows', () => {
    const res: IGradeHistoryResponse = {
      studentId: 's1',
      courses: [
        {
          courseExternalId: 'c-math',
          courseName: 'Math',
          snapshots: [
            { date: '2025-02-01', percentGrade: 85.4, provider: 'canvas' },
            { date: '2025-02-08', percentGrade: 90, provider: 'canvas' },
          ],
        },
      ],
    };
    const { rows, courseOrder } = pivotToChartData(res);
    expect(courseOrder).toEqual([{ courseExternalId: 'c-math', courseName: 'Math' }]);
    expect(rows).toHaveLength(2);
    expect(rows[0].date).toBe('2025-02-01');
    expect(rows[0]['c-math']).toBe(85.4);
    expect(rows[1].date).toBe('2025-02-08');
    expect(rows[1]['c-math']).toBe(90);
  });

  it('pivots multiple courses with shared and distinct dates', () => {
    const res: IGradeHistoryResponse = {
      studentId: 's1',
      courses: [
        {
          courseExternalId: 'c-a',
          courseName: 'Algebra',
          snapshots: [
            { date: '2025-02-01', percentGrade: 80, provider: 'test' },
            { date: '2025-02-08', percentGrade: 82, provider: 'test' },
          ],
        },
        {
          courseExternalId: 'c-b',
          courseName: 'Biology',
          snapshots: [
            { date: '2025-02-01', percentGrade: 72, provider: 'test' },
            { date: '2025-02-15', percentGrade: 75, provider: 'test' },
          ],
        },
      ],
    };
    const { rows, courseOrder } = pivotToChartData(res);
    expect(courseOrder).toHaveLength(2);
    const dates = rows.map((r) => r.date).sort();
    expect(dates).toEqual(['2025-02-01', '2025-02-08', '2025-02-15']);
    const rowFeb1 = rows.find((r) => r.date === '2025-02-01');
    expect(rowFeb1!['c-a']).toBe(80);
    expect(rowFeb1!['c-b']).toBe(72);
    const rowFeb15 = rows.find((r) => r.date === '2025-02-15');
    expect(rowFeb15!['c-b']).toBe(75);
    expect(rowFeb15!['c-a']).toBeUndefined();
  });

  it('rounds percentGrade to one decimal', () => {
    const res: IGradeHistoryResponse = {
      studentId: 's1',
      courses: [
        {
          courseExternalId: 'c1',
          courseName: 'Course',
          snapshots: [{ date: '2025-02-01', percentGrade: 88.567, provider: 'test' }],
        },
      ],
    };
    const { rows } = pivotToChartData(res);
    expect(rows[0]['c1']).toBe(88.6);
  });
});

describe('AllCoursesGradeTrend', () => {
  beforeEach(() => {
    studentsApi.getGradeHistory.mockResolvedValue(null);
  });

  it('renders loading state initially', () => {
    studentsApi.getGradeHistory.mockImplementation(() => new Promise(() => {}));
    render(<AllCoursesGradeTrend studentId="stu-1" />);
    expect(screen.getByTestId('all-courses-grade-trend-loading')).toBeTruthy();
  });

  it('renders empty state when no or insufficient data', async () => {
    studentsApi.getGradeHistory.mockResolvedValue({ studentId: 'stu-1', courses: [] });
    render(<AllCoursesGradeTrend studentId="stu-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('all-courses-grade-trend-empty')).toBeTruthy();
    });
    expect(screen.getByText(/All-courses trend needs 2\+ data points/)).toBeTruthy();
  });

  it('renders empty state when only one date', async () => {
    studentsApi.getGradeHistory.mockResolvedValue({
      studentId: 'stu-1',
      courses: [
        {
          courseExternalId: 'c1',
          courseName: 'Math',
          snapshots: [{ date: '2025-02-01', percentGrade: 85, provider: 'test' }],
        },
      ],
    });
    render(<AllCoursesGradeTrend studentId="stu-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('all-courses-grade-trend-empty')).toBeTruthy();
    });
  });

  it('renders chart when two or more dates and at least one course', async () => {
    studentsApi.getGradeHistory.mockResolvedValue({
      studentId: 'stu-1',
      courses: [
        {
          courseExternalId: 'c1',
          courseName: 'Math',
          snapshots: [
            { date: '2025-02-01', percentGrade: 80, provider: 'test' },
            { date: '2025-02-08', percentGrade: 85, provider: 'test' },
          ],
        },
      ],
    });
    render(<AllCoursesGradeTrend studentId="stu-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('all-courses-grade-trend')).toBeTruthy();
    });
    expect(screen.getByText('All courses trend')).toBeTruthy();
  });

  it('calls getGradeHistory with from and to when provided', async () => {
    studentsApi.getGradeHistory.mockResolvedValue({ studentId: 'stu-1', courses: [] });
    render(
      <AllCoursesGradeTrend
        studentId="stu-1"
        from="2025-01-01"
        to="2025-06-30"
      />
    );
    await waitFor(() => {
      expect(studentsApi.getGradeHistory).toHaveBeenCalledWith('stu-1', undefined, {
        from: '2025-01-01',
        to: '2025-06-30',
        term: undefined,
      });
    });
  });

  it('shows error state and Retry when getGradeHistory fails', async () => {
    studentsApi.getGradeHistory.mockRejectedValue(new Error('API error'));
    render(<AllCoursesGradeTrend studentId="stu-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('all-courses-grade-trend-error')).toBeTruthy();
      expect(screen.getByText(/Couldn't load trend data/)).toBeTruthy();
      expect(screen.getByTestId('button-error-retry')).toBeTruthy();
    });
  });

  it('calls getGradeHistory again when Retry is clicked after error', async () => {
    studentsApi.getGradeHistory
      .mockRejectedValueOnce(new Error('Fail'))
      .mockResolvedValueOnce({ studentId: 'stu-1', courses: [] });
    render(<AllCoursesGradeTrend studentId="stu-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('button-error-retry')).toBeTruthy();
    });
    const callsBefore = studentsApi.getGradeHistory.mock.calls.length;
    fireEvent.click(screen.getByTestId('button-error-retry'));
    await waitFor(() => {
      expect(studentsApi.getGradeHistory.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});
