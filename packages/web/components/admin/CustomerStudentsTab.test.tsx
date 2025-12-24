import { render, screen, waitFor } from '@testing-library/react';
import { CustomerStudentsTab } from './CustomerStudentsTab';
import { adminCustomersApi } from '@/lib/api/admin/customers';

jest.mock('@/lib/api/admin/customers');

describe('CustomerStudentsTab', () => {
  beforeEach(() => {
    (adminCustomersApi.getStudents as jest.Mock).mockResolvedValue({ success: true, data: [] });
  });

  it('renders empty state', async () => {
    render(<CustomerStudentsTab customerId="u1" />);
    await waitFor(() => expect(screen.getByTestId('customer-students-empty')).toBeInTheDocument());
  });

  it('renders students', async () => {
    (adminCustomersApi.getStudents as jest.Mock).mockResolvedValue({
      success: true,
      data: [
        {
          id: 's1',
          userId: 'u1',
          name: 'Student One',
          grade: 5,
          studentId: 'S-001',
          stats: { currentGPA: 3.75, missingAssignments: 2, totalAssignments: 10 },
        },
      ],
    });

    render(<CustomerStudentsTab customerId="u1" />);
    await waitFor(() => expect(screen.getByText('Student One')).toBeInTheDocument());
    expect(screen.getByTestId('customer-students-list')).toBeInTheDocument();
  });
});


