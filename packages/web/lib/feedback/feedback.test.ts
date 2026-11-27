/** @jest-environment jsdom */
import {
  feedbackPlacement,
  feedbackPlacementForWidth,
  isFeedbackInMenu,
  markFeedbackReady,
  openFeedback,
  resetFeedbackForTests,
  subscribeFeedback,
} from './feedback';

function setWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
}

describe('where the Feedback entry lives', () => {
  beforeEach(() => {
    resetFeedbackForTests();
    delete window.NoctusoftFeedback;
  });

  it.each([320, 375, 390, 430, 767])(
    'is the menu at %i px, where the navigation is a drawer',
    (w) => {
      expect(feedbackPlacementForWidth(w)).toBe('menu');
    }
  );

  it.each([768, 1024, 1440])('is the floating button at %i px', (w) => {
    expect(feedbackPlacementForWidth(w)).toBe('floating');
  });

  it('is decided once per page load, because the widget script reads its options once', () => {
    setWidth(390);
    expect(feedbackPlacement()).toBe('menu');

    // The phone is turned sideways, or the window is widened. The widget cannot bring its
    // button back, so the menu entry must stay.
    setWidth(1200);
    expect(feedbackPlacement()).toBe('menu');
  });

  it('stays the floating button after a wide load, however narrow the window gets', () => {
    setWidth(1200);
    expect(feedbackPlacement()).toBe('floating');

    setWidth(390);
    expect(feedbackPlacement()).toBe('floating');
  });
});

describe('the menu entry', () => {
  beforeEach(() => {
    resetFeedbackForTests();
    delete window.NoctusoftFeedback;
  });

  it('is not offered before the widget has loaded: there would be nothing to open', () => {
    setWidth(390);
    expect(isFeedbackInMenu()).toBe(false);
  });

  it('is offered on a phone once the widget has loaded', () => {
    setWidth(390);
    markFeedbackReady();
    expect(isFeedbackInMenu()).toBe(true);
  });

  it('is not offered on a wide screen, where the floating button is', () => {
    setWidth(1280);
    markFeedbackReady();
    expect(isFeedbackInMenu()).toBe(false);
  });

  it('tells its listeners when the widget loads, and stops when they unsubscribe', () => {
    setWidth(390);
    const listener = jest.fn();
    const unsubscribe = subscribeFeedback(listener);

    markFeedbackReady();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    markFeedbackReady();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('openFeedback', () => {
  beforeEach(() => {
    delete window.NoctusoftFeedback;
  });

  it("opens the widget's form", () => {
    const open = jest.fn();
    window.NoctusoftFeedback = { open, close: jest.fn() };

    openFeedback();

    expect(open).toHaveBeenCalledTimes(1);
  });

  it('does nothing, and does not throw, when the widget is not on the page', () => {
    expect(() => openFeedback()).not.toThrow();
  });
});
