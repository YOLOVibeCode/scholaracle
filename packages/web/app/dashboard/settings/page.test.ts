import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('dashboard settings server AI toggle', () => {
  it('exposes switch-server-ai and consents API wiring', () => {
    const src = readFileSync(join(__dirname, 'page.tsx'), 'utf8');
    expect(src).toMatch(/data-testid="switch-server-ai"/);
    expect(src).toMatch(/consentsApi/);
  });
});
