/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { RunsPageClient } from './RunsPageClient';

jest.mock('@/lib/api/client', () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

const { apiClient } = jest.requireMock<{ apiClient: { get: jest.Mock } }>('@/lib/api/client');

describe('RunsPageClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders gap list when runs include coverage', async () => {
    apiClient.get
      .mockResolvedValueOnce([{ id: 'src-1', sourceId: 'src-1' }])
      .mockResolvedValueOnce([
        {
          runId: 'run-1',
          sourceId: 'src-1',
          status: 'committed',
          startedAt: '2026-01-15T10:00:00.000Z',
          error: null,
          clientMeta: { clientType: 'mobile', coreVersion: '0.2.0' },
          coverage: {
            students: [
              {
                studentExternalId: 'stu-1',
                courses: 1,
                coursesWithGrade: 0,
                coursesWithAssignments: 0,
                attendanceRows: 0,
                teacherEmails: 0,
                gaps: [{ course: 'Entrepreneurship', kind: 'no_grade_no_assignments' }],
              },
            ],
          },
          steps: [
            { name: 'starting', startedAt: '2026-01-15T09:59:00.000Z', ms: 0, ok: true },
            { name: 'extracting', startedAt: '2026-01-15T10:00:00.000Z', ms: 3200, ok: true },
          ],
          warnings: ['assignment[asn-1]: assignment.title is required'],
        },
      ]);

    render(<RunsPageClient studentId="student-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('runs-page')).toBeInTheDocument();
    });
    expect(screen.getByTestId('list-gaps')).toBeInTheDocument();
    expect(screen.getByText(/Entrepreneurship: grade none, assignments 0/)).toBeInTheDocument();
    expect(screen.getByTestId('list-run-steps')).toBeInTheDocument();
    expect(screen.getByTestId('run-step-extracting')).toBeInTheDocument();
    expect(screen.getByTestId('list-run-warnings')).toBeInTheDocument();
    expect(screen.getByText(/assignment\.title is required/)).toBeInTheDocument();
  });
});
