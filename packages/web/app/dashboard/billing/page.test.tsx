/**
 * Billing page lays out current plan and plan includes side by side from md breakpoint up.
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import BillingPage from './page';
import { billingApi } from '@/lib/api/billing';

jest.mock('@/lib/api/billing');
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: () => null,
    toString: () => '',
  }),
}));
jest.mock('@/components/billing/UpgradePlanPicker', () => ({
  UpgradePlanPicker: () => <div data-testid="upgrade-plan-picker-mock" />,
}));
jest.mock('@/components/billing/ChangePlanConfirmDialog', () => ({
  ChangePlanConfirmDialog: () => null,
}));

describe('BillingPage plan overview layout', () => {
  beforeEach(() => {
    (billingApi.getSubscription as jest.Mock).mockResolvedValue({
      plan: 'premium',
      status: 'active',
      effectivePlan: 'premium',
      billingCycle: 'monthly',
      featureLines: ['2 students', 'SMS alerts'],
    });
    (billingApi.getInvoices as jest.Mock).mockResolvedValue([]);
  });

  it('places current plan and plan includes in a responsive md:grid-cols-2 row', async () => {
    render(<BillingPage />);

    await waitFor(() => {
      expect(screen.getByTestId('current-plan')).toBeInTheDocument();
    });

    const overview = screen.getByTestId('billing-plan-overview');
    expect(overview.className).toContain('md:grid-cols-2');
    expect(overview).toContainElement(screen.getByTestId('current-plan-card'));
    expect(overview).toContainElement(screen.getByTestId('plan-includes-card'));
  });
});
