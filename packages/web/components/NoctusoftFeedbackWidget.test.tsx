/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import {
  FEEDBACK_PRODUCT_KEY,
  FEEDBACK_WIDGET_SRC,
  NoctusoftFeedbackWidget,
} from './NoctusoftFeedbackWidget';

// next/script needs Next's head manager; stand in with a plain <script> that keeps the props.
jest.mock('next/script', () => ({
  __esModule: true,
  default: ({ strategy, ...props }: { strategy: string; src: string }) => (
    <script data-testid="feedback-widget-script" data-strategy={strategy} {...props} />
  ),
}));

describe('NoctusoftFeedbackWidget', () => {
  it('loads the relay widget for the scholarmancy product key after hydration', () => {
    const { container } = render(<NoctusoftFeedbackWidget />);

    const script = container.querySelector('[data-testid="feedback-widget-script"]');
    expect(script).toBeInTheDocument();
    expect(script).toHaveAttribute('src', FEEDBACK_WIDGET_SRC);
    expect(script).toHaveAttribute('src', 'https://store.noctusoft.com/feedback/widget.js');
    expect(script).toHaveAttribute('data-product', FEEDBACK_PRODUCT_KEY);
    expect(script).toHaveAttribute('data-product', 'scholarmancy');
    expect(script).toHaveAttribute('data-strategy', 'afterInteractive');
  });
});
