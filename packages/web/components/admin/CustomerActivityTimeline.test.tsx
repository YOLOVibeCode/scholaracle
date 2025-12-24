import { render, screen } from '@testing-library/react';
import { CustomerActivityTimeline } from './CustomerActivityTimeline';

describe('CustomerActivityTimeline', () => {
  it('renders empty state', () => {
    render(<CustomerActivityTimeline items={[]} />);
    expect(screen.getByTestId('customer-activity-empty')).toBeInTheDocument();
  });

  it('renders activity items', () => {
    render(
      <CustomerActivityTimeline
        items={[
          {
            id: 'a1',
            type: 'payment',
            title: 'Payment succeeded',
            occurredAt: new Date('2024-01-01T00:00:00Z').toISOString(),
            meta: {},
          },
        ]}
      />
    );

    expect(screen.getByTestId('customer-activity-list')).toBeInTheDocument();
    expect(screen.getByText('Payment succeeded')).toBeInTheDocument();
  });
});


