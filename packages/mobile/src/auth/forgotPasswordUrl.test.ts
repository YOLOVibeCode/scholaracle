import { forgotPasswordUrl } from './forgotPasswordUrl';

describe('forgotPasswordUrl', () => {
  it('points production builds at scholarmancy.com', () => {
    expect(forgotPasswordUrl(undefined, 'https://api.scholarmancy.com')).toBe(
      'https://scholarmancy.com/forgot-password'
    );
  });
  it('points UAT builds at the UAT web app', () => {
    expect(forgotPasswordUrl('', 'https://api-uat.scholarmancy.com')).toBe(
      'https://web-uat.scholarmancy.com/forgot-password'
    );
  });
  it('uses the local web app for local builds', () => {
    expect(forgotPasswordUrl(undefined, 'http://localhost:2801')).toBe(
      'http://localhost:2800/forgot-password'
    );
  });
  it('prefills a trimmed, encoded email', () => {
    expect(forgotPasswordUrl('  a+b@x.com ', 'https://api.scholarmancy.com')).toBe(
      'https://scholarmancy.com/forgot-password?email=a%2Bb%40x.com'
    );
  });
});
