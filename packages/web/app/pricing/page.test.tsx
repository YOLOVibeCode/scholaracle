/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import PricingPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/lib/api/billing', () => ({
  billingApi: { validateCoupon: jest.fn() },
}));

describe('PricingPage plan card layout', () => {
  it('renders all plan CTAs and pins footers for equal-height cards', () => {
    render(<PricingPage />);
    expect(screen.getByTestId('pricing-page')).toBeInTheDocument();
    const planIds = ['free', 'starter', 'premium', 'family'] as const;
    for (const id of planIds) {
      expect(screen.getByTestId(`plan-card-${id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`select-${id}`)).toBeInTheDocument();
    }
    for (const id of planIds) {
      const card = screen.getByTestId(`plan-card-${id}`);
      expect(card).toHaveClass('h-full');
      const content = card.querySelector('[data-slot="card-content"]');
      expect(content).toHaveClass('flex-1');
      const footer = card.querySelector('[data-slot="card-footer"]');
      expect(footer).toHaveClass('mt-auto');
    }
  });
});
