/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { StudentDataSourcesTab } from './StudentDataSourcesTab';
import { sourcesApi } from '@/lib/api/sources';

jest.mock('@/lib/api/sources', () => ({
  sourcesApi: {
    listForStudent: jest.fn(),
  },
}));

const listMock = sourcesApi.listForStudent as jest.MockedFunction<typeof sourcesApi.listForStudent>;

describe('StudentDataSourcesTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows Last sync from lastSuccessAt when present', async () => {
    const iso = '2026-03-10T15:30:00.000Z';
    listMock.mockResolvedValue([
      {
        id: 'src-1',
        pluginId: 'p',
        provider: 'canvas',
        displayName: 'Canvas',
        enabled: true,
        schedule: 'manual',
        dataTypes: ['grades'],
        status: 'active',
        lastSuccessAt: iso,
      },
    ]);

    render(<StudentDataSourcesTab studentId="stu-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('source-desc-src-1')).toHaveTextContent('Last sync:');
    });
    expect(screen.getByTestId('source-desc-src-1').textContent).toContain(
      new Date(iso).toLocaleString()
    );
  });
});
