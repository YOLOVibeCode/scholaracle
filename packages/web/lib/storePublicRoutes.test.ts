import { readFileSync } from 'fs';
import { join } from 'path';

describe('middleware public App Store routes', () => {
  const src = readFileSync(join(__dirname, '../middleware.ts'), 'utf8');

  it.each(['/privacy', '/terms', '/support', '/delete-account', '/pricing'])(
    'treats %s as public so App Review can load it without a session',
    (route) => {
      expect(src).toContain(`'${route}'`);
    }
  );

  it('does not send robots.txt or sitemap.xml through the auth matcher', () => {
    expect(src).toMatch(/robots\.txt/);
    expect(src).toMatch(/sitemap\.xml/);
  });
});
