/**
 * TDD / ISP: Account page – profile display and password reset flow.
 * Mocks settingsApi and authApi; asserts UI and requestPasswordReset contract.
 * @jest-environment jsdom
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AccountPage from './page';
import { settingsApi } from '@/lib/api/settings';
import { authApi } from '@/lib/api/auth';

jest.mock('@/lib/api/settings');
jest.mock('@/lib/api/auth');
jest.mock('next/link', () => {
  return function MockLink({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) {
    return <a href={href} {...rest}>{children}</a>;
  };
});

describe('Account Page (TDD / ISP)', () => {
  beforeEach(() => {
    (settingsApi.get as jest.Mock).mockResolvedValue({
      profile: { name: 'Test User', email: 'test@example.com' },
      notifications: {},
      alerts: {},
    });
  });

  it('renders account page with heading', () => {
    render(<AccountPage />);
    expect(screen.getByTestId('dashboard-account-page')).toBeTruthy();
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText(/Manage your account and security/)).toBeTruthy();
  });

  it('loads and displays profile from settings API', async () => {
    render(<AccountPage />);
    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeTruthy();
    });
    expect(screen.getByText('test@example.com')).toBeTruthy();
    expect(settingsApi.get).toHaveBeenCalled();
  });

  it('shows Password section with send reset button', async () => {
    render(<AccountPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Send password reset email/i })).toBeTruthy();
    });
  });

  it('calls requestPasswordReset with profile email when button clicked', async () => {
    (authApi.requestPasswordReset as jest.Mock).mockResolvedValue({ success: true });
    render(<AccountPage />);
    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeTruthy();
    });
    const button = screen.getByRole('button', { name: /Send password reset email/i });
    fireEvent.click(button);
    await waitFor(() => {
      expect(authApi.requestPasswordReset).toHaveBeenCalledWith('test@example.com');
    });
  });

  it('shows success message after reset email sent', async () => {
    (authApi.requestPasswordReset as jest.Mock).mockResolvedValue({ success: true });
    render(<AccountPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Send password reset email/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Send password reset email/i }));
    await waitFor(() => {
      expect(screen.getByText(/Check your inbox at test@example.com/)).toBeTruthy();
    });
  });

  it('shows error when requestPasswordReset fails', async () => {
    (authApi.requestPasswordReset as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Too many requests',
    });
    render(<AccountPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Send password reset email/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Send password reset email/i }));
    await waitFor(() => {
      expect(screen.getByText('Too many requests')).toBeTruthy();
    });
  });

  it('links to Settings', async () => {
    render(<AccountPage />);
    await waitFor(() => {
      expect(screen.getByTestId('link-settings')).toBeTruthy();
    });
    const link = screen.getByTestId('link-settings');
    expect(link.getAttribute('href')).toBe('/dashboard/settings');
  });
});
