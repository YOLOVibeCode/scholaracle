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
});
