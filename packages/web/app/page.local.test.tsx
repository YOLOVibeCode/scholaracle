/**
 * The home page on a developer machine, where the API's seed routes are open
 * and the one-click demo works.
 *
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import HomePage from './page';
import { authApi } from '@/lib/api/auth';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
}));
jest.mock('next/link', () => {
  return function MockLink({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  };
});
jest.mock('@/lib/api/auth', () => ({
  authApi: { login: jest.fn() },
}));

const login = authApi.login as jest.Mock;
const fetchMock = jest.fn();

describe('HomePage on a developer machine', () => {
  beforeEach(() => {
    push.mockReset();
    login.mockReset();
    fetchMock.mockReset();
    (globalThis as { fetch: unknown }).fetch = fetchMock;
  });

  it('runs on localhost', () => {
    expect(window.location.hostname).toBe('localhost');
  });

  it('offers the demo in the nav, the hero and the closing section', async () => {
    render(<HomePage />);
    expect(await screen.findByTestId('nav-try-demo')).toBeInTheDocument();
    expect(screen.getByTestId('hero-explore-demo')).toBeInTheDocument();
    expect(screen.getByTestId('final-cta-demo')).toBeInTheDocument();
    expect(screen.getByTestId('demo-logins')).toHaveTextContent('demo@scholarmancy.com');
  });

  it('still offers creating an account', async () => {
    render(<HomePage />);
    await screen.findByTestId('hero-explore-demo');
    expect(screen.getByTestId('hero-create-account')).toHaveAttribute('href', '/register');
    expect(screen.getByTestId('final-cta-register')).toHaveAttribute('href', '/register');
  });

  it('loads the demo household, signs in, and opens the dashboard', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    login.mockResolvedValue({ success: true, token: 'jwt' });
    render(<HomePage />);

    fireEvent.click(await screen.findByTestId('hero-explore-demo'));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/seed\/demo$/),
      expect.objectContaining({ method: 'POST' })
    );
    expect(login).toHaveBeenCalledWith('demo@scholarmancy.com', expect.any(String), true);
  });

  it('shows the reason when the demo cannot load', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'No database' }) });
    render(<HomePage />);

    fireEvent.click(await screen.findByTestId('hero-explore-demo'));

    expect(await screen.findByTestId('hero-demo-error')).toHaveTextContent('No database');
    expect(push).not.toHaveBeenCalled();
  });
});
