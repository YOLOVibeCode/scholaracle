/**
 * Billing page: plan overview layout and the paid plan switch flow.
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BillingPage from './page';
import { billingApi } from '@/lib/api/billing';
import { ApiClientError } from '@/lib/api/client';

jest.mock('@/lib/api/billing');
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: () => null,
    toString: () => '',
  }),
}));
jest.mock('@/components/billing/UpgradePlanPicker', () => ({
  UpgradePlanPicker: ({
    mode,
    onSwitchRequest,
  }: {
    mode: string;
    onSwitchRequest?: (plan: string, cycle: string) => void;
  }) => (
    <div data-testid="upgrade-plan-picker-mock" data-mode={mode}>
      <button
        type="button"
        data-testid="mock-request-switch"
        onClick={() => onSwitchRequest?.('premium', 'monthly')}
      >
        switch
      </button>
    </div>
  ),
}));
jest.mock('@/components/billing/ChangePlanConfirmDialog', () => ({
  ChangePlanConfirmDialog: ({
    onConfirm,
    onOpenChange,
    isSubmitting,
    error,
  }: {
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
    isSubmitting: boolean;
    error?: string | null;
  }) => (
    <div data-testid="confirm-dialog-mock" data-submitting={String(isSubmitting)}>
      <span data-testid="mock-dialog-error">{error ?? ''}</span>
      <button type="button" data-testid="mock-confirm" onClick={onConfirm}>
        confirm
      </button>
      <button type="button" data-testid="mock-dismiss" onClick={() => onOpenChange(false)}>
        dismiss
      </button>
    </div>
  ),
}));

const familySubscription = {
  plan: 'family',
  status: 'active',
  effectivePlan: 'family',
  billingCycle: 'monthly',
  featureLines: ['5 students', 'SMS alerts'],
  canChangePlan: true,
};

function mockSubscription(subscription: Record<string, unknown>) {
  (billingApi.getSubscription as jest.Mock).mockResolvedValue(subscription);
}

async function openSwitchDialog() {
  render(<BillingPage />);
  await waitFor(() => expect(screen.getByTestId('mock-request-switch')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('mock-request-switch'));
  expect(screen.getByTestId('confirm-dialog-mock')).toBeInTheDocument();
}

describe('BillingPage plan overview layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscription({
      plan: 'premium',
      status: 'active',
      effectivePlan: 'premium',
      billingCycle: 'monthly',
      featureLines: ['2 students', 'SMS alerts'],
      canChangePlan: true,
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

describe('BillingPage plan picker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (billingApi.getInvoices as jest.Mock).mockResolvedValue([]);
  });

  it('offers checkout on the free plan', async () => {
    mockSubscription({ plan: 'free', status: 'active', effectivePlan: 'free' });
    render(<BillingPage />);

    const picker = await screen.findByTestId('upgrade-plan-picker-mock');
    expect(picker).toHaveAttribute('data-mode', 'checkout');
  });

  it('offers a plan switch on a running paid store subscription', async () => {
    mockSubscription(familySubscription);
    render(<BillingPage />);

    const picker = await screen.findByTestId('upgrade-plan-picker-mock');
    expect(picker).toHaveAttribute('data-mode', 'switch');
  });

  it('offers no switch on a coupon trial or a past-due card, where the API would refuse it', async () => {
    mockSubscription({ ...familySubscription, status: 'trialing', canChangePlan: false });
    render(<BillingPage />);

    await waitFor(() => expect(screen.getByTestId('current-plan')).toBeInTheDocument());
    expect(screen.queryByTestId('upgrade-plan-picker-mock')).not.toBeInTheDocument();
  });
});

describe('BillingPage plan switch flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscription(familySubscription);
    (billingApi.getInvoices as jest.Mock).mockResolvedValue([]);
  });

  it('shows the full new subscription when the change applied now', async () => {
    (billingApi.changePlan as jest.Mock).mockResolvedValue({
      effective: 'now',
      subscription: {
        plan: 'premium',
        status: 'active',
        effectivePlan: 'premium',
        billingCycle: 'monthly',
        featureLines: ['2 students', 'Advanced analytics'],
        canChangePlan: true,
      },
    });
    await openSwitchDialog();

    fireEvent.click(screen.getByTestId('mock-confirm'));

    await waitFor(() =>
      expect(screen.queryByTestId('confirm-dialog-mock')).not.toBeInTheDocument()
    );
    expect(billingApi.changePlan).toHaveBeenCalledWith('premium', 'monthly');
    expect(screen.getByTestId('billing-toast')).toHaveTextContent('Your plan has been changed.');
    expect(screen.getByTestId('current-plan')).toHaveTextContent('Premium');
    // The plan benefits card follows the new plan instead of vanishing.
    expect(screen.getByTestId('plan-includes-card')).toHaveTextContent('Advanced analytics');
  });

  it('says the buyer keeps the current plan when the store scheduled the change', async () => {
    (billingApi.changePlan as jest.Mock).mockResolvedValue({
      effective: 'next_period',
      pendingPlan: { plan: 'premium', billingCycle: 'monthly' },
      subscription: familySubscription,
    });
    await openSwitchDialog();

    fireEvent.click(screen.getByTestId('mock-confirm'));

    await waitFor(() => expect(screen.getByTestId('billing-toast')).toBeInTheDocument());
    const toast = screen.getByTestId('billing-toast').textContent ?? '';
    expect(toast).toMatch(/switch to Premium is scheduled/i);
    expect(toast).toMatch(/keep your current plan until your next renewal date/i);
    expect(screen.getByTestId('current-plan')).toHaveTextContent('Family');
  });

  it('keeps the dialog open and shows the reason inside it when the change fails', async () => {
    (billingApi.changePlan as jest.Mock).mockRejectedValue(
      new ApiClientError('We could not change your plan right now. Nothing was changed.', 502)
    );
    await openSwitchDialog();

    fireEvent.click(screen.getByTestId('mock-confirm'));

    await waitFor(() =>
      expect(screen.getByTestId('mock-dialog-error')).toHaveTextContent(
        'We could not change your plan right now. Nothing was changed.'
      )
    );
    expect(screen.getByTestId('confirm-dialog-mock')).toBeInTheDocument();
    // Not in a toast behind the overlay.
    expect(screen.queryByTestId('billing-toast')).not.toBeInTheDocument();
  });

  it('falls back to a generic reason for an unexpected failure', async () => {
    (billingApi.changePlan as jest.Mock).mockRejectedValue(new Error('network'));
    await openSwitchDialog();

    fireEvent.click(screen.getByTestId('mock-confirm'));

    await waitFor(() =>
      expect(screen.getByTestId('mock-dialog-error')).toHaveTextContent(
        'Failed to change plan. Try again or contact support.'
      )
    );
  });

  it('ignores a dismiss while the change is in flight, then closes on request when idle', async () => {
    let resolveChange: (value: unknown) => void = () => undefined;
    (billingApi.changePlan as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveChange = resolve;
      })
    );
    await openSwitchDialog();

    fireEvent.click(screen.getByTestId('mock-confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('confirm-dialog-mock')).toHaveAttribute('data-submitting', 'true')
    );

    fireEvent.click(screen.getByTestId('mock-dismiss'));
    expect(screen.getByTestId('confirm-dialog-mock')).toBeInTheDocument();

    resolveChange({ effective: 'now', subscription: familySubscription });
    await waitFor(() =>
      expect(screen.queryByTestId('confirm-dialog-mock')).not.toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId('mock-request-switch'));
    expect(screen.getByTestId('confirm-dialog-mock')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mock-dismiss'));
    expect(screen.queryByTestId('confirm-dialog-mock')).not.toBeInTheDocument();
  });

  it('clears an old error when the buyer starts a new switch', async () => {
    (billingApi.changePlan as jest.Mock).mockRejectedValue(new ApiClientError('Declined', 402));
    await openSwitchDialog();
    fireEvent.click(screen.getByTestId('mock-confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('mock-dialog-error')).toHaveTextContent('Declined')
    );

    fireEvent.click(screen.getByTestId('mock-dismiss'));
    fireEvent.click(screen.getByTestId('mock-request-switch'));

    expect(screen.getByTestId('mock-dialog-error')).toHaveTextContent('');
  });
});
