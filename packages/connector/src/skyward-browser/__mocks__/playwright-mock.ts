/**
 * Playwright mocks for Skyward browser scraper unit tests.
 */

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/explicit-function-return-type
function createMockLocatorLeaf(): {
  fill: jest.Mock;
  click: jest.Mock;
  count: jest.Mock;
  selectOption: jest.Mock;
  nth: jest.Mock;
  first: jest.Mock;
  filter: jest.Mock;
  textContent: jest.Mock;
} {
  const leaf = {
    fill: jest.fn().mockResolvedValue(undefined),
    click: jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(1),
    selectOption: jest.fn().mockResolvedValue(undefined),
    textContent: jest.fn().mockResolvedValue(''),
    nth: jest.fn().mockImplementation(function (this: unknown) {
      return this;
    }),
    first: jest.fn().mockImplementation(function (this: unknown) {
      return this;
    }),
    filter: jest.fn().mockImplementation(function (this: unknown) {
      return this;
    }),
  };
  (leaf.nth as jest.Mock).mockReturnValue(leaf);
  (leaf.first as jest.Mock).mockReturnValue(leaf);
  (leaf.filter as jest.Mock).mockReturnValue(leaf);
  return leaf;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/explicit-function-return-type
export function createMockLocator() {
  return createMockLocatorLeaf();
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/explicit-function-return-type
export function createMockPage(overrides: { url?: string; evaluateReturn?: unknown } = {}) {
  const locator = jest.fn().mockReturnValue(createMockLocator());
  const goto = jest.fn().mockResolvedValue(undefined);
  const waitForLoadState = jest.fn().mockResolvedValue(undefined);
  const waitForTimeout = jest.fn().mockResolvedValue(undefined);
  const waitForURL = jest.fn().mockResolvedValue(undefined);
  const waitForSelector = jest.fn().mockResolvedValue(undefined);
  const evaluate = jest.fn().mockResolvedValue(overrides.evaluateReturn ?? null);
  const content = jest.fn().mockResolvedValue('<html></html>');
  const setDefaultTimeout = jest.fn();
  const urlFn = jest.fn().mockReturnValue(overrides.url ?? 'https://example.com');

  return {
    goto,
    url: urlFn,
    locator,
    waitForLoadState,
    waitForTimeout,
    waitForURL,
    waitForSelector,
    evaluate,
    content,
    setDefaultTimeout,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/explicit-function-return-type
export function createMockContext() {
  return {
    newPage: jest.fn().mockResolvedValue(createMockPage()),
    on: jest.fn(),
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/explicit-function-return-type
export function createMockBrowser() {
  return {
    newContext: jest.fn().mockResolvedValue(createMockContext()),
    close: jest.fn().mockResolvedValue(undefined),
  };
}
