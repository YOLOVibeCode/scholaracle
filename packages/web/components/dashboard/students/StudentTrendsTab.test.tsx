/**
 * Unit tests for StudentTrendsTab: loading, risk cards, term selector, chart, confirm dialog, error/retry.
 * TDD/ISP: small focused tests per behavior.
 * @jest-environment jsdom
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { StudentTrendsTab } from './StudentTrendsTab';
import { studentsApi } from '@/lib/api/students';

jest.mock('@/lib/api/students', () => ({
  studentsApi: {
    getGrades: jest.fn(),
    getGradeHistory: jest.fn(),
    archiveGradeHistory: jest.fn(),
  },
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const mockGetGrades = studentsApi.getGrades as jest.Mock;
const mockGetGradeHistory = studentsApi.getGradeHistory as jest.Mock;
const mockArchiveGradeHistory = studentsApi.archiveGradeHistory as jest.Mock;

/** Minimal grade history with two date ranges so term options include a non-"all" option. */
function historyWithTermOptions() {
  return {
    studentId: 'stu-1',
    courses: [
      {
        courseExternalId: 'c1',
        courseName: 'Math',
        snapshots: [
          { date: '2024-09-01', percentGrade: 80, provider: 'test' },
          { date: '2025-06-15', percentGrade: 85, provider: 'test' },
        ],
      },
    ],
  };
}

describe('StudentTrendsTab', () => {
  beforeEach(() => {
    mockGetGrades.mockResolvedValue({
      studentId: 'stu-1',
      studentName: 'Test Student',
      overallGPA: 82,
      courseGrades: [],
      atRiskCourses: 0,
    });
    mockGetGradeHistory.mockResolvedValue({ studentId: 'stu-1', courses: [] });
    mockArchiveGradeHistory.mockResolvedValue(undefined);
  });

  it('renders loading state initially', () => {
    mockGetGrades.mockImplementation(() => new Promise(() => {}));
    mockGetGradeHistory.mockImplementation(() => new Promise(() => {}));
    render(<StudentTrendsTab studentId="stu-1" />);
    expect(screen.getByTestId('trends-tab-loading')).toBeTruthy();
  });

  it('loads grades and grade history on mount', async () => {
    render(<StudentTrendsTab studentId="stu-1" />);
    await waitFor(() => {
      expect(mockGetGrades).toHaveBeenCalledWith('stu-1');
      expect(mockGetGradeHistory).toHaveBeenCalledWith('stu-1');
    });
  });

  it('renders tab content with term selector after load', async () => {
    render(<StudentTrendsTab studentId="stu-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('student-trends-tab')).toBeTruthy();
    });
    expect(screen.getByTestId('trends-term-select')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: /Term/i })).toBeTruthy();
  });

  it('renders risk cards when course grades exist', async () => {
    mockGetGrades.mockResolvedValue({
      studentId: 'stu-1',
      studentName: 'Test',
      overallGPA: 78,
      courseGrades: [
        {
          courseExternalId: 'c1',
          courseName: 'Algebra',
          grade: 72,
          letterGrade: 'C',
          totalAssignments: 10,
          gradedAssignments: 8,
          missingAssignments: 1,
          lateAssignments: 0,
          totalPointsPossible: 100,
          totalPointsEarned: 72,
          recentTrend: 'declining',
          riskLevel: 'high',
          assignments: [],
        },
      ],
      atRiskCourses: 1,
    });
    render(<StudentTrendsTab studentId="stu-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('trends-risk-cards')).toBeTruthy();
    });
    expect(screen.getByTestId('trends-risk-card-c1')).toBeTruthy();
    expect(screen.getByText('Algebra')).toBeTruthy();
    expect(screen.getByText('72')).toBeTruthy();
  });

  it('renders AllCoursesGradeTrend (empty or chart) after load', async () => {
    render(<StudentTrendsTab studentId="stu-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('student-trends-tab')).toBeTruthy();
    });
    await waitFor(() => {
      const empty = screen.queryByTestId('all-courses-grade-trend-empty');
      const loading = screen.queryByTestId('all-courses-grade-trend-loading');
      const chart = screen.queryByTestId('all-courses-grade-trend');
      expect(empty ?? chart).toBeTruthy();
      expect(loading).toBeFalsy();
    });
  });

  it('archive button not visible when term is All time', async () => {
    render(<StudentTrendsTab studentId="stu-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('student-trends-tab')).toBeTruthy();
    });
    expect(screen.queryByTestId('trends-archive-button')).toBeFalsy();
  });

  it('opens confirm dialog when Archive semester is clicked and term is not All time', async () => {
    mockGetGradeHistory.mockResolvedValue(historyWithTermOptions());
    mockGetGrades.mockResolvedValue({
      studentId: 'stu-1',
      studentName: 'Test',
      overallGPA: 80,
      courseGrades: [{ courseExternalId: 'c1', courseName: 'Math', grade: 85, letterGrade: 'B', totalAssignments: 5, gradedAssignments: 5, missingAssignments: 0, lateAssignments: 0, totalPointsPossible: 100, totalPointsEarned: 85, recentTrend: 'stable', riskLevel: 'none', assignments: [] }],
      atRiskCourses: 0,
    });
    render(<StudentTrendsTab studentId="stu-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('trends-term-select')).toBeTruthy();
    });
    const select = screen.getByTestId('trends-term-select');
    fireEvent.change(select, { target: { value: '2024-09-01_2025-06-15' } });
    await waitFor(() => {
      expect(screen.getByTestId('trends-archive-button')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('trends-archive-button'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeTruthy();
      expect(screen.getByText(/Archive grade history\?/)).toBeTruthy();
    });
    expect(mockArchiveGradeHistory).not.toHaveBeenCalled();
  });

  it('calls archiveGradeHistory only after user confirms in dialog', async () => {
    mockGetGradeHistory.mockResolvedValue(historyWithTermOptions());
    mockGetGrades.mockResolvedValue({
      studentId: 'stu-1',
      studentName: 'Test',
      overallGPA: 80,
      courseGrades: [{ courseExternalId: 'c1', courseName: 'Math', grade: 85, letterGrade: 'B', totalAssignments: 5, gradedAssignments: 5, missingAssignments: 0, lateAssignments: 0, totalPointsPossible: 100, totalPointsEarned: 85, recentTrend: 'stable', riskLevel: 'none', assignments: [] }],
      atRiskCourses: 0,
    });
    mockArchiveGradeHistory.mockResolvedValue(undefined);
    render(<StudentTrendsTab studentId="stu-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('trends-term-select')).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId('trends-term-select'), { target: { value: '2024-09-01_2025-06-15' } });
    await waitFor(() => {
      expect(screen.getByTestId('trends-archive-button')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('trends-archive-button'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('button-confirm-dialog'));
    await waitFor(() => {
      expect(mockArchiveGradeHistory).toHaveBeenCalledWith('stu-1', expect.any(String));
    });
  });

  it('shows error state and Retry when load fails', async () => {
    mockGetGrades.mockRejectedValue(new Error('Network error'));
    mockGetGradeHistory.mockRejectedValue(new Error('Network error'));
    render(<StudentTrendsTab studentId="stu-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('trends-tab-error')).toBeTruthy();
      expect(screen.getByText(/Failed to load trends/i)).toBeTruthy();
      expect(screen.getByTestId('button-error-retry')).toBeTruthy();
    });
  });

  it('calls load again when Retry is clicked after load error', async () => {
    mockGetGrades.mockRejectedValueOnce(new Error('Fail')).mockResolvedValueOnce({
      studentId: 'stu-1',
      studentName: 'Test',
      overallGPA: 80,
      courseGrades: [],
      atRiskCourses: 0,
    });
    mockGetGradeHistory.mockRejectedValueOnce(new Error('Fail')).mockResolvedValueOnce({ studentId: 'stu-1', courses: [] });
    render(<StudentTrendsTab studentId="stu-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('button-error-retry')).toBeTruthy();
    });
    const getGradesCallsBefore = mockGetGrades.mock.calls.length;
    const getHistoryCallsBefore = mockGetGradeHistory.mock.calls.length;
    fireEvent.click(screen.getByTestId('button-error-retry'));
    await waitFor(() => {
      expect(mockGetGrades.mock.calls.length).toBeGreaterThan(getGradesCallsBefore);
      expect(mockGetGradeHistory.mock.calls.length).toBeGreaterThan(getHistoryCallsBefore);
    });
  });
});
