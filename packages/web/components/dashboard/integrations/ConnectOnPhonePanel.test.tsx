/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ConnectOnPhonePanel } from './ConnectOnPhonePanel';

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

describe('ConnectOnPhonePanel', () => {
  it('tells a parent who does not have the app where to get it', () => {
    render(<ConnectOnPhonePanel studentId="student-1" />);

    const link = screen.getByTestId('link-get-app');
    expect(link).toHaveAttribute('href', '/get-app');
    // The parent is in the middle of adding a student; do not lose that page.
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('still shows the code that opens the app', () => {
    render(<ConnectOnPhonePanel studentId="student-1" />);

    expect(screen.getByTestId('connect-phone-qr')).toBeInTheDocument();
    expect(screen.getByTestId('button-copy-connect-link')).toBeInTheDocument();
  });

  /**
   * Until 26 Nov 2026 the code was an image fetched from api.qrserver.com, with the
   * link (and so the student's id) in the address. The page now draws it itself.
   */
  describe('the code is drawn on the page', () => {
    it('asks no other server for it, so the student id leaves with no request', () => {
      const { container } = render(<ConnectOnPhonePanel studentId="student-1" />);

      const loaded = Array.from(container.querySelectorAll('[src]')).map((el) =>
        el.getAttribute('src')
      );
      expect(loaded).toEqual([]);
      expect(container.innerHTML).not.toMatch(/https?:\/\/(?!www\.w3\.org\/)/);
    });

    it('is a picture a screen reader can name', () => {
      render(<ConnectOnPhonePanel studentId="student-1" />);

      const code = screen.getByRole('img', { name: /QR code to open Scholarmancy/i });
      expect(code).toHaveAttribute('data-testid', 'connect-phone-qr');
      expect(code.tagName.toLowerCase()).toBe('svg');
    });

    it('holds the link for this student: another student gives another code', () => {
      const first = render(<ConnectOnPhonePanel studentId="student-1" />);
      const firstPath = first.container.querySelector('[data-testid="connect-phone-qr"] path');
      const firstShape = firstPath?.getAttribute('d') ?? '';
      first.unmount();

      const second = render(<ConnectOnPhonePanel studentId="student-2" />);
      const secondPath = second.container.querySelector('[data-testid="connect-phone-qr"] path');
      const secondShape = secondPath?.getAttribute('d') ?? '';

      expect(firstShape.length).toBeGreaterThan(100);
      expect(secondShape.length).toBeGreaterThan(100);
      expect(secondShape).not.toBe(firstShape);
    });

    it('keeps the quiet border a phone camera needs around the code', () => {
      const { container } = render(<ConnectOnPhonePanel studentId="student-1" />);

      const svg = container.querySelector('[data-testid="connect-phone-qr"]');
      const [, , width, height] = (svg?.getAttribute('viewBox') ?? '').split(' ').map(Number);
      const xs = Array.from(
        (svg?.querySelector('path')?.getAttribute('d') ?? '').matchAll(/M(\d+) (\d+)/g)
      ).map((m) => Number(m[1]));

      expect(xs.length).toBeGreaterThan(20);
      expect(width).toBeGreaterThan(20);
      expect(width).toBe(height);
      // Four empty modules on every side.
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(4);
      expect(Math.max(...xs)).toBeLessThanOrEqual((width ?? 0) - 5);
    });
  });
});
