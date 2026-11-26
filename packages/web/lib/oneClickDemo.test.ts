import { isOneClickDemoAvailable } from './oneClickDemo';

describe('isOneClickDemoAvailable', () => {
  it('is available on a developer machine', () => {
    expect(isOneClickDemoAvailable('localhost', undefined)).toBe(true);
    expect(isOneClickDemoAvailable('127.0.0.1', undefined)).toBe(true);
    expect(isOneClickDemoAvailable('LOCALHOST', '')).toBe(true);
  });

  it('is not available on the live site or any other deployed host', () => {
    expect(isOneClickDemoAvailable('scholarmancy.com', undefined)).toBe(false);
    expect(isOneClickDemoAvailable('www.scholarmancy.com', undefined)).toBe(false);
    expect(isOneClickDemoAvailable('dev.scholarmancy.com', '')).toBe(false);
    expect(isOneClickDemoAvailable('web-dev-1234.up.railway.app', undefined)).toBe(false);
  });

  it('is available on a deployed host whose build carries a seed token', () => {
    expect(isOneClickDemoAvailable('uat.scholarmancy.com', 'a-seed-token')).toBe(true);
  });

  it('is not fooled by a host that only contains the word localhost', () => {
    expect(isOneClickDemoAvailable('localhost.example.com', undefined)).toBe(false);
    expect(isOneClickDemoAvailable('notlocalhost', undefined)).toBe(false);
  });
});
