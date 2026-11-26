/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import SupportPage from './page';
import { markFeedbackReady, resetFeedbackForTests } from '@/lib/feedback/feedback';

function setWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
}

/**
 * Every public page links to Support. On a phone the feedback widget's floating button is
 * not drawn, so this page is where a visitor without an account finds the form.
 */
describe('Support page — Send feedback', () => {
  beforeEach(() => {
    resetFeedbackForTests();
    delete window.NoctusoftFeedback;
  });

  it('offers the form on a phone', () => {
    setWidth(390);
    markFeedbackReady();
    const open = jest.fn();
    window.NoctusoftFeedback = { open, close: jest.fn() };

    render(<SupportPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    expect(open).toHaveBeenCalledTimes(1);
  });

  it('leaves it to the floating button on a wide screen', () => {
    setWidth(1280);
    markFeedbackReady();

    render(<SupportPage />);

    expect(screen.queryByRole('button', { name: 'Send feedback' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Sign In' })).toBeInTheDocument();
  });
});
