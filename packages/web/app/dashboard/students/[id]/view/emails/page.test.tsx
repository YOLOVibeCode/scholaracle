/**
 * The student's email history ("view as student") on a narrow screen: the same filter row as
 * the Email History page. Five buttons and the count are wider than a phone screen.
 * @jest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import StudentEmailHistoryPage from './page';
import { emailHistoryApi } from '@/lib/api/email-history';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'stu-1' }),
}));
jest.mock('@/lib/api/email-history', () => ({
  emailHistoryApi: {
    list: jest.fn(),
    getDetail: jest.fn(),
    resend: jest.fn(),
  },
}));

const listMock = emailHistoryApi.list as jest.MockedFunction<typeof emailHistoryApi.list>;

describe('StudentEmailHistoryPage on a narrow screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listMock.mockResolvedValue({ success: true, data: [], total: 0, totalPages: 1 });
  });

  it('lets the filter buttons and the count wrap', async () => {
    render(<StudentEmailHistoryPage />);

    await waitFor(() => expect(screen.getByTestId('email-count').textContent).toBe('0 emails'));
    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ studentId: 'stu-1' }));
    const filters = screen.getByTestId('email-status-filters');
    expect(filters.className.split(/\s+/)).toContain('flex-wrap');
    expect(filters.contains(screen.getByRole('button', { name: 'Preview' }))).toBe(true);
    expect(filters.contains(screen.getByTestId('email-count'))).toBe(true);
  });
});
