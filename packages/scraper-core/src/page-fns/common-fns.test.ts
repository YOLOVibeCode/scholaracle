/**
 * @jest-environment jsdom
 */
import { isLoginFormShowing } from './common-fns';

/** jsdom has no layout, so give an element a size to make it "visible". */
function setSize(el: Element, width: number, height: number): void {
  el.getBoundingClientRect = (): DOMRect =>
    ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0 }) as DOMRect;
}

describe('isLoginFormShowing', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is true for a visible password field', () => {
    document.body.innerHTML = '<form><input name="u"><input type="password" id="p"></form>';
    setSize(document.getElementById('p')!, 200, 30);
    expect(isLoginFormShowing()).toBe(true);
  });

  it('is false when the page has no password field (signed in)', () => {
    document.body.innerHTML = '<nav><a href="#">Gradebook</a></nav>';
    expect(isLoginFormShowing()).toBe(false);
  });

  it('ignores hidden, zero-size and disabled password fields', () => {
    document.body.innerHTML = [
      '<input type="password" id="a" style="display:none">',
      '<input type="password" id="b" style="visibility:hidden">',
      '<input type="password" id="c">',
      '<input type="password" id="d" disabled>',
    ].join('');
    setSize(document.getElementById('a')!, 200, 30);
    setSize(document.getElementById('b')!, 200, 30);
    setSize(document.getElementById('d')!, 200, 30);
    // #c keeps jsdom's zero size.
    expect(isLoginFormShowing()).toBe(false);
  });
});
