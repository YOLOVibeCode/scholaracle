/**
 * The home page as a visitor to the live site sees it.
 *
 * On 25 Nov 2026 its three "Try the demo" buttons answered "Seed routes are not
 * available on this server", and it listed demo sign-ins the live server does
 * not accept. The demo loads through the API's seed routes, which are open only
 * on a developer machine.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://scholarmancy.com/"}
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import HomePage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
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

describe('HomePage on the live site', () => {
  it('runs on a host that is not a developer machine', () => {
    expect(window.location.hostname).toBe('scholarmancy.com');
  });

  it('does not offer a demo it cannot load', () => {
    render(<HomePage />);
    expect(screen.queryByTestId('nav-try-demo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('hero-explore-demo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('final-cta-demo')).not.toBeInTheDocument();
    expect(screen.queryByText(/try the demo/i)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/No signup for demo/i);
    expect(document.body).not.toHaveTextContent(/live demo/i);
  });

  it('does not list demo sign-ins', () => {
    render(<HomePage />);
    expect(screen.queryByTestId('demo-logins')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Demo logins/i);
    expect(document.body).not.toHaveTextContent(/demo@scholarmancy\.com/i);
  });

  it('leads with creating an account, in the nav, the hero and the closing section', () => {
    render(<HomePage />);
    expect(screen.getByTestId('nav-create-account')).toHaveAttribute('href', '/register');
    expect(screen.getByTestId('hero-create-account')).toHaveAttribute('href', '/register');
    expect(screen.getByTestId('final-cta-register')).toHaveAttribute('href', '/register');
  });

  it('offers sign-in in the nav at every width', () => {
    render(<HomePage />);
    const signIn = screen.getByTestId('nav-sign-in');
    expect(signIn).toHaveAttribute('href', '/login');
    expect(signIn.closest('.hidden')).toBeNull();
  });

  it('puts a space after the comma in the headline at every width', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Never miss a grade drop, assignment, or deadline.'
    );
  });
});
