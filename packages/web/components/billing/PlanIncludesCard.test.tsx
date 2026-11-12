/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { PlanIncludesCard } from './PlanIncludesCard';

describe('PlanIncludesCard', () => {
  it('renders feature lines from subscription', () => {
    render(
      <PlanIncludesCard
        subscription={{
          plan: 'premium',
          status: 'active',
          effectivePlan: 'premium',
          featureLines: ['2 students', 'Advanced analytics'],
        }}
      />
    );
    expect(screen.getByTestId('plan-includes-card')).toBeInTheDocument();
    expect(screen.getByText('Advanced analytics')).toBeInTheDocument();
  });
});
