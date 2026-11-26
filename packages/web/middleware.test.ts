/**
 * Ensures brand static assets are not gated by auth middleware so next/image can fetch them.
 */
import { config } from './middleware';

describe('middleware config', () => {
  it('excludes logo assets from the auth matcher', () => {
    const [matcher] = config.matcher;
    expect(matcher).toContain('logo-128.png');
    expect(matcher).toContain('logo.png');
  });
});
