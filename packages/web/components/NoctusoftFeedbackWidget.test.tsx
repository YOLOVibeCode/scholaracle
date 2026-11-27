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
import { isFeedbackInMenu, resetFeedbackForTests } from '@/lib/feedback/feedback';

// next/script needs Next's head manager; stand in with a plain <script> that keeps the props
// and reports "ready" on mount, as Next does once the script has run.
jest.mock('next/script', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  function ScriptStandIn({
    strategy,
    onReady,
    ...props
  }: {
    strategy: string;
    src: string;
    onReady?: () => void;
  }): React.ReactElement {
    React.useEffect(() => {
      onReady?.();
    }, [onReady]);
    return <script data-testid="feedback-widget-script" data-strategy={strategy} {...props} />;
  }
  return { __esModule: true, default: ScriptStandIn };
});

function setWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
}

beforeEach(() => {
  resetFeedbackForTests();
  setWidth(1280);
});

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

  /**
   * The widget's button floats over the bottom-right corner. On a small phone that corner
   * holds the page's own buttons: at 375 x 667 it covered most of "Done connecting" in the
   * Add student wizard and took the tap.
   */
  describe('the floating button', () => {
    it('stays on a wide screen', () => {
      setWidth(1280);
      const { container } = render(<NoctusoftFeedbackWidget hostname="scholarmancy.com" />);

      const script = container.querySelector('[data-testid="feedback-widget-script"]');
      expect(script).toBeInTheDocument();
      expect(script).not.toHaveAttribute('data-hide-button');
    });

    it.each([320, 375, 390, 767])('is not drawn on a %i px screen', (width) => {
      setWidth(width);
      const { container } = render(<NoctusoftFeedbackWidget hostname="scholarmancy.com" />);

      const script = container.querySelector('[data-testid="feedback-widget-script"]');
      expect(script).toBeInTheDocument();
      expect(script).toHaveAttribute('data-hide-button', 'true');
    });

    it('hands feedback to the menu once the script is ready on a phone', () => {
      setWidth(390);
      expect(isFeedbackInMenu()).toBe(false);

      render(<NoctusoftFeedbackWidget hostname="scholarmancy.com" />);

      expect(isFeedbackInMenu()).toBe(true);
    });

    it('never hands feedback to the menu on a host where the widget cannot load', () => {
      setWidth(390);

      render(<NoctusoftFeedbackWidget hostname="web-dev-8552.up.railway.app" />);

      expect(isFeedbackInMenu()).toBe(false);
    });
  });
});
