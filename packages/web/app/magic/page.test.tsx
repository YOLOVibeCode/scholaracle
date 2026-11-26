/**
 * /magic on a phone tries the app, then tells the parent what to do if the app
 * is not installed. It must not send them to a store listing that is not live.
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import MagicPage from './page';
import { APP_DOWNLOADS } from '@/lib/app-downloads';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'token' ? 'tok-123' : null),
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

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';

const LISTINGS_NOT_LIVE = [
  'apps.apple.com/app/scholarmancy',
  'play.google.com/store/apps/details?id=com.scholarmancy.app',
];

function setUserAgent(userAgent: string): void {
  Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true });
}

function allHrefs(): string[] {
  return Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
}

/** Renders the page and lets the "is the app installed?" wait run out. */
function renderAndWaitForFallback(): void {
  render(<MagicPage />);
  act(() => {
    jest.advanceTimersByTime(1600);
  });
}

describe('MagicPage', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    replace.mockClear();
    // jsdom logs "Not implemented: navigation" when the page tries scholarmancy://
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
    jest.useRealTimers();
  });

  it('sends a computer straight to the web sign-in', () => {
    setUserAgent(MAC);
    render(<MagicPage />);

    expect(replace).toHaveBeenCalledWith('/login?magic=tok-123');
  });

  it('on an iPhone without the app, offers the download that exists today', () => {
    setUserAgent(IPHONE);
    renderAndWaitForFallback();

    expect(screen.getByTestId('link-magic-get-app')).toHaveAttribute(
      'href',
      APP_DOWNLOADS.ios?.url
    );
    expect(screen.getByTestId('link-magic-continue-web')).toHaveAttribute(
      'href',
      '/login?magic=tok-123'
    );
  });

  it('on an Android phone without the app, offers the web sign-in and no download', () => {
    setUserAgent(ANDROID);
    renderAndWaitForFallback();

    expect(screen.queryByTestId('link-magic-get-app')).not.toBeInTheDocument();
    expect(screen.getByTestId('link-magic-continue-web')).toHaveAttribute(
      'href',
      '/login?magic=tok-123'
    );
    // The link is single-use. Signing in on the web by itself could spend it
    // while the app, if it did open, is also using it.
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ['iPhone', IPHONE],
    ['Android', ANDROID],
  ])('on %s, does not link to a store listing that is not live', (_name, userAgent) => {
    setUserAgent(userAgent);
    renderAndWaitForFallback();

    for (const listing of LISTINGS_NOT_LIVE) {
      expect(allHrefs().filter((href) => href.includes(listing))).toEqual([]);
    }
  });
});
