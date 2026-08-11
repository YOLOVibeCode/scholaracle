import { isDemoDeepLink } from './demoLogin';

describe('isDemoDeepLink', () => {
  it.each([
    ['scholarmancy://demo', true],
    ['scholarmancy://demo/', true],
    ['scholarmancy:///demo', true],
    ['scholarmancy://DEMO', true],
    ['scholarmancy:demo', true],
    ['  scholarmancy://demo  ', true],
    ['scholarmancy://demo/extra', false],
    ['scholarmancy://dashboard', false],
    ['scholarmancy://', false],
    ['https://scholarmancy.com/demo', false],
    ['exp://127.0.0.1:8081', false],
    [null, false],
    [undefined, false],
    ['not a url', false],
  ])('%s -> %s', (url, expected) => {
    expect(isDemoDeepLink(url)).toBe(expected);
  });
});
