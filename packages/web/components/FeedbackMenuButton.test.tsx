/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FeedbackMenuButton } from './FeedbackMenuButton';
import { markFeedbackReady, resetFeedbackForTests } from '@/lib/feedback/feedback';

function setWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
}

describe('FeedbackMenuButton', () => {
  beforeEach(() => {
    resetFeedbackForTests();
    delete window.NoctusoftFeedback;
  });

  it('is not there on a wide screen, where the floating button is', () => {
    setWidth(1280);
    markFeedbackReady();

    render(<FeedbackMenuButton />);

    expect(screen.queryByTestId('button-send-feedback')).toBeNull();
  });

  it('is not there on a phone until the widget has loaded', () => {
    setWidth(390);

    render(<FeedbackMenuButton />);

    expect(screen.queryByTestId('button-send-feedback')).toBeNull();
  });

  it('appears on a phone when the widget loads after the page', () => {
    setWidth(390);
    render(<FeedbackMenuButton />);

    act(() => markFeedbackReady());

    expect(screen.getByRole('button', { name: 'Send feedback' })).toBeInTheDocument();
  });

  it("opens the widget's form when pressed", () => {
    setWidth(390);
    markFeedbackReady();
    const open = jest.fn();
    window.NoctusoftFeedback = { open, close: jest.fn() };
    render(<FeedbackMenuButton />);

    fireEvent.click(screen.getByTestId('button-send-feedback'));

    expect(open).toHaveBeenCalledTimes(1);
  });

  it("runs the caller's step first, so a menu can close before the form opens", () => {
    setWidth(390);
    markFeedbackReady();
    const order: string[] = [];
    window.NoctusoftFeedback = { open: () => order.push('form'), close: jest.fn() };
    render(<FeedbackMenuButton onBeforeOpen={() => order.push('menu closed')} />);

    fireEvent.click(screen.getByTestId('button-send-feedback'));

    expect(order).toEqual(['menu closed', 'form']);
  });

  it('takes its own label', () => {
    setWidth(390);
    markFeedbackReady();

    render(<FeedbackMenuButton>Tell us what went wrong</FeedbackMenuButton>);

    expect(screen.getByRole('button', { name: 'Tell us what went wrong' })).toBeInTheDocument();
  });
});
