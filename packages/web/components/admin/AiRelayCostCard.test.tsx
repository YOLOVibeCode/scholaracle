/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { AiRelayCostCard } from './AiRelayCostCard';
import { adminAiApi } from '@/lib/api/admin/ai';

jest.mock('@/lib/api/admin/ai', () => ({
  adminAiApi: {
    getUsageSummary: jest.fn(),
  },
}));

const mockGetUsageSummary = adminAiApi.getUsageSummary as jest.MockedFunction<
  typeof adminAiApi.getUsageSummary
>;

describe('AiRelayCostCard', () => {
  beforeEach(() => {
    mockGetUsageSummary.mockReset();
  });

  it('renders totals from the API summary', async () => {
    mockGetUsageSummary.mockResolvedValue({
      success: true,
      data: {
        monthToDateSpendUsd: 0.00039,
        verificationPassRate: 1,
        repairsByDistrict: [{ portalHost: 'district.test.edu', repairCount: 1 }],
      },
    });

    render(<AiRelayCostCard />);

    await waitFor(() => {
      expect(screen.getByTestId('ai-relay-mtd-spend')).toHaveTextContent('$0.000390');
    });
    expect(screen.getByTestId('ai-relay-pass-rate')).toHaveTextContent('100%');
    expect(screen.getByTestId('ai-relay-district-district.test.edu')).toHaveTextContent('1');
  });
});
