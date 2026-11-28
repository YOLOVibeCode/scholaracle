/**
 * The Email History page on a narrow screen: five filter buttons and the count are wider than a
 * phone screen, so the row must be able to wrap.
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import EmailHistoryPage from './page';
import { emailHistoryApi } from '@/lib/api/email-history';

jest.mock('@/lib/api/email-history', () => ({
  emailHistoryApi: {
    list: jest.fn(),
    getDetail: jest.fn(),
    resend: jest.fn(),
    deleteAll: jest.fn(),
  },
}));

const listMock = emailHistoryApi.list as jest.MockedFunction<typeof emailHistoryApi.list>;

describe('EmailHistoryPage on a narrow screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listMock.mockResolvedValue({ success: true, data: [], total: 0, totalPages: 1 });
  });

  it('lets the filter buttons and the count wrap', async () => {
    render(<EmailHistoryPage />);

    await screen.findByText('No emails sent yet.');
    const filters = screen.getByTestId('email-status-filters');
    expect(filters.className.split(/\s+/)).toContain('flex-wrap');
    expect(filters.contains(screen.getByRole('button', { name: 'Preview' }))).toBe(true);
    expect(filters.contains(screen.getByTestId('email-count'))).toBe(true);
    expect(screen.getByTestId('email-count').textContent).toBe('0 emails');
  });
});
