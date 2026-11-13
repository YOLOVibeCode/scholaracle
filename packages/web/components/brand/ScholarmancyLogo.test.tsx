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
    width: number;
    height: number;
    'data-testid'?: string;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={props.alt}
      src={props.src}
      width={props.width}
      height={props.height}
      data-testid={props['data-testid']}
      className={props.className}
    />
  ),
}));

describe('ScholarmancyLogo', () => {
  it('exposes a stable logo test id', () => {
    render(<ScholarmancyLogo />);
    expect(screen.getByTestId('logo')).toHaveAttribute('alt', 'Scholarmancy');
  });

  it('loads the smaller public brand asset at the requested size', () => {
    render(<ScholarmancyLogo size={32} />);
    const logo = screen.getByTestId('logo');
    expect(logo).toHaveAttribute('src', '/logo-128.png');
    expect(logo).toHaveAttribute('width', '32');
    expect(logo).toHaveAttribute('height', '32');
    expect(logo).toHaveClass('shrink-0');
  });
});
