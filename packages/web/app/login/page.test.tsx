/**
 * The login page says "session expired" from the URL reason, and from the reason the API client
 * remembered when its own redirect lost to a reload that was already in flight.
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import LoginPage from './page';
import { SESSION_REDIRECT_REASON_KEY } from '@/lib/auth/clearParentSession';

const searchParams = new Map<string, string>();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => ({
    get: (key: string) => searchParams.get(key) ?? null,
    toString: () => '',
  }),
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
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: { alt: string; 'data-testid'?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt} data-testid={props['data-testid']} />
  ),
}));
jest.mock('@/components/auth/OAuthButtons', () => ({ OAuthButtons: () => null }));
jest.mock('@/lib/api/auth', () => ({
  authApi: { login: jest.fn(), loginWithMagicToken: jest.fn() },
}));

describe('LoginPage session-expired notice', () => {
  beforeEach(() => {
    searchParams.clear();
    sessionStorage.clear();
  });

  it('shows the notice when the URL carries the reason', async () => {
    searchParams.set('reason', 'session_expired');
    render(<LoginPage />);
    expect(await screen.findByTestId('message-session-expired')).toBeInTheDocument();
  });

  it('shows the notice from the remembered reason when the URL has none, and consumes it', async () => {
    sessionStorage.setItem(SESSION_REDIRECT_REASON_KEY, 'session_expired');
    render(<LoginPage />);
    expect(await screen.findByTestId('message-session-expired')).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_REDIRECT_REASON_KEY)).toBeNull();
  });

  it('shows no notice on a plain visit', async () => {
    render(<LoginPage />);
    await screen.findByTestId('form-login');
    expect(screen.queryByTestId('message-session-expired')).not.toBeInTheDocument();
  });

  it('shows the brand logo on a plain visit', async () => {
    render(<LoginPage />);
    await screen.findByTestId('form-login');
    expect(screen.getByTestId('logo')).toHaveAttribute('alt', 'Scholarmancy');
  });
});
