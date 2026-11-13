/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ScholarmancyLogo } from './ScholarmancyLogo';

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: {
    alt: string;
    src: string;
    className?: string;
    'data-testid'?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={props.alt}
      src={props.src}
      className={props.className}
      data-testid={props['data-testid']}
    />
  ),
}));

describe('ScholarmancyLogo', () => {
  it('exposes a stable logo test id', () => {
    render(<ScholarmancyLogo />);
    expect(screen.getByTestId('logo')).toHaveAttribute('alt', 'Scholarmancy');
  });

  it('loads the public brand asset', () => {
    render(<ScholarmancyLogo />);
    expect(screen.getByTestId('logo')).toHaveAttribute('src', '/logo-128.png');
  });
});
