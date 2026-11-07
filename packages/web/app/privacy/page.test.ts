import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('privacy policy server AI', () => {
  it('documents opt-in server-side analysis', () => {
    const src = readFileSync(join(__dirname, 'page.tsx'), 'utf8');
    expect(src).toMatch(/Server-side analysis/);
    expect(src).toMatch(/off by default/i);
  });
});
