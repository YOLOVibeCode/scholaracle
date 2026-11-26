/**
 * /get-app must only offer a download that exists. On 25 Nov 2026 both of its
 * buttons led to store listings that answered 404.
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import GetAppPage from './page';
import { APP_DOWNLOADS, NO_APP_NOTE } from '@/lib/app-downloads';

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

/**
 * Listings that do not exist yet. Remove a line on the day that listing is
 * live and `APP_DOWNLOADS` points at it.
 */
const LISTINGS_NOT_LIVE = [
  'apps.apple.com/app/scholarmancy',
  'play.google.com/store/apps/details?id=com.scholarmancy.app',
];

function allHrefs(): string[] {
  return Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
}

describe('GetAppPage', () => {
  it('does not link to a store listing that is not live', () => {
    render(<GetAppPage />);

    for (const listing of LISTINGS_NOT_LIVE) {
      expect(allHrefs().filter((href) => href.includes(listing))).toEqual([]);
    }
  });

  it('links to the iPhone download that exists today', () => {
    render(<GetAppPage />);

    const ios = APP_DOWNLOADS.ios;
    expect(ios).not.toBeNull();
    expect(screen.getByTestId('link-get-app-ios')).toHaveAttribute('href', ios?.url);
    expect(screen.getByTestId('link-get-app-ios')).toHaveTextContent(ios?.label ?? '');
  });

  it('says plainly that there is no Android app yet, with no button', () => {
    render(<GetAppPage />);

    expect(APP_DOWNLOADS.android).toBeNull();
    expect(screen.getByTestId('notice-get-app-android')).toHaveTextContent(NO_APP_NOTE.android);
    expect(screen.queryByTestId('link-get-app-android')).not.toBeInTheDocument();
  });

  it('keeps the way back to the website', () => {
    render(<GetAppPage />);

    expect(screen.getByTestId('link-get-app-sign-in')).toHaveAttribute('href', '/login');
  });
});
