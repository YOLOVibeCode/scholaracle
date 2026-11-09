/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import {
  FEEDBACK_PRODUCT_KEY,
  FEEDBACK_WIDGET_SRC,
  NoctusoftFeedbackWidget,
  isFeedbackHostAllowed,
} from './NoctusoftFeedbackWidget';

// next/script needs Next's head manager; stand in with a plain <script> that keeps the props.
jest.mock('next/script', () => ({
  __esModule: true,
  default: ({ strategy, ...props }: { strategy: string; src: string }) => (
    <script data-testid="feedback-widget-script" data-strategy={strategy} {...props} />
  ),
}));

describe('isFeedbackHostAllowed', () => {
  it.each([
    'localhost',
    '127.0.0.1',
    'scholarmancy.com',
    'web-uat.scholarmancy.com',
    'WWW.Scholarmancy.com',
  ])('allows %s', (host): void => expect(isFeedbackHostAllowed(host)).toBe(true));
  it.each([
    'web-dev-8552.up.railway.app',
    'evilscholarmancy.com',
    'scholarmancy.com.evil.test',
    '',
  ])('blocks %s', (host): void => expect(isFeedbackHostAllowed(host)).toBe(false));
});

describe('NoctusoftFeedbackWidget', () => {
  it('renders nothing on a host the relay does not allow (the Railway dev URL)', () => {
    const { container } = render(
      <NoctusoftFeedbackWidget hostname="web-dev-8552.up.railway.app" />
    );
    expect(container.querySelector('[data-testid="feedback-widget-script"]')).toBeNull();
  });

  it('loads the relay widget for the scholarmancy product key after hydration', () => {
    const { container } = render(<NoctusoftFeedbackWidget hostname="web-uat.scholarmancy.com" />);

    const script = container.querySelector('[data-testid="feedback-widget-script"]');
    expect(script).toBeInTheDocument();
    expect(script).toHaveAttribute('src', FEEDBACK_WIDGET_SRC);
    expect(script).toHaveAttribute('src', 'https://store.noctusoft.com/feedback/widget.js');
    expect(script).toHaveAttribute('data-product', FEEDBACK_PRODUCT_KEY);
    expect(script).toHaveAttribute('data-product', 'scholarmancy');
    expect(script).toHaveAttribute('data-strategy', 'afterInteractive');
  });
});
