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

  describe('members (sharing-spec §4.2: connect / credentials are owner and admin only)', () => {
    const source = {
      id: 'src-1',
      pluginId: 'p',
      provider: 'canvas',
      displayName: 'Canvas',
      enabled: true,
      schedule: 'manual',
      dataTypes: ['grades'],
      status: 'active',
      hasCredentials: true,
    } as const;

    it('hides connect, credentials and the integration management link for a member', async () => {
      listMock.mockResolvedValue([source]);
      render(<StudentDataSourcesTab studentId="stu-1" canManageSources={false} />);
      await screen.findByTestId('source-src-1');
      expect(screen.queryByTestId('link-integration-src-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('button-credentials-src-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('button-connect-source')).not.toBeInTheDocument();
      expect(screen.queryByTestId('button-connect-to-integration')).not.toBeInTheDocument();
      // Looking is fine: runs stay visible.
      expect(screen.getByTestId('button-view-runs-src-1')).toBeInTheDocument();
    });

    it('shows all of them by default (owner / admin)', async () => {
      listMock.mockResolvedValue([source]);
      render(<StudentDataSourcesTab studentId="stu-1" />);
      await screen.findByTestId('source-src-1');
      expect(screen.getByTestId('link-integration-src-1')).toHaveAttribute('href', '/dashboard/integrations/src-1');
      expect(screen.getByTestId('button-credentials-src-1')).toBeInTheDocument();
      expect(screen.getByTestId('button-connect-source')).toBeInTheDocument();
    });
  });
});
