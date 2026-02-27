/**
 * TDD Tests for CustomerOverviewTab component
 * Following ISP: Small, focused component for customer overview
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { CustomerOverviewTab } from './CustomerOverviewTab';
import type { ICustomerDetail } from '@/lib/api/admin/customers';

const mockCustomer: ICustomerDetail = {
  id: '123',
  email: 'test@example.com',
  name: 'Test User',
  phone: '+1234567890',
  phoneVerified: true,
  subscription: {
    plan: 'premium',
    status: 'active',
  },
  isSuspended: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('CustomerOverviewTab Component (ISP)', () => {
  it('should render customer details', () => {
    render(<CustomerOverviewTab customer={mockCustomer} onSuspend={() => {}} onUnsuspend={() => {}} />);
    
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText('+1234567890')).toBeInTheDocument();
  });

  it('should show suspended status', () => {
    const suspendedCustomer = { ...mockCustomer, isSuspended: true, suspendedReason: 'Test reason' };
    render(<CustomerOverviewTab customer={suspendedCustomer} onSuspend={() => {}} onUnsuspend={() => {}} />);
    
    expect(screen.getByText(/suspended/i)).toBeInTheDocument();
    expect(screen.getByText('Test reason')).toBeInTheDocument();
  });

  it('should show subscription information', () => {
    render(<CustomerOverviewTab customer={mockCustomer} onSuspend={() => {}} onUnsuspend={() => {}} />);
    
    expect(screen.getByTestId('subscription-plan')).toHaveTextContent(/premium/i);
    expect(screen.getByTestId('subscription-status')).toHaveTextContent(/active/i);
  });

  it('should call onSuspend when suspend button is clicked', () => {
    const onSuspend = jest.fn();
    render(<CustomerOverviewTab customer={mockCustomer} onSuspend={onSuspend} onUnsuspend={() => {}} />);
    
    const suspendButton = screen.getByRole('button', { name: /suspend/i });
    suspendButton.click();
    
    expect(onSuspend).toHaveBeenCalled();
  });

  it('should call onUnsuspend when unsuspend button is clicked', () => {
    const onUnsuspend = jest.fn();
    const suspendedCustomer = { ...mockCustomer, isSuspended: true };
    render(<CustomerOverviewTab customer={suspendedCustomer} onSuspend={() => {}} onUnsuspend={onUnsuspend} />);
    
    const unsuspendButton = screen.getByRole('button', { name: /unsuspend/i });
    unsuspendButton.click();
    
    expect(onUnsuspend).toHaveBeenCalled();
  });
});

