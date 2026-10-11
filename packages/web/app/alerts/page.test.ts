import { readFileSync } from 'fs';
import { join } from 'path';

describe('/alerts short link', () => {
  it('redirects to the parent alerts page', () => {
    const src = readFileSync(join(__dirname, 'page.tsx'), 'utf8');
    expect(src).toMatch(/redirect\('\/dashboard\/alerts'\)/);
  });
});
