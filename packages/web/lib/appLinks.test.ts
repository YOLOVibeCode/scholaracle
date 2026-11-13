import { readFileSync } from 'fs';
import { join } from 'path';
import nextConfig from '../next.config';

const root = join(__dirname, '..');

describe('iOS universal links (apple-app-site-association)', () => {
  const aasa = JSON.parse(
    readFileSync(join(root, 'public/.well-known/apple-app-site-association'), 'utf8')
  ) as {
    applinks: {
      details: { appIDs: string[]; components: { '/': string }[] }[];
    };
  };

  it('binds the Apple team + bundle id and claims only /magic', () => {
    const [detail] = aasa.applinks.details;
    expect(detail?.appIDs).toEqual(['N42FM5L5KD.com.scholarmancy.app']);
    expect(detail?.components.map((c) => c['/'])).toEqual(['/magic']);
  });

  it('is served as application/json', async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const rule = rules.find((r) => r.source === '/.well-known/apple-app-site-association');
    expect(rule?.headers).toContainEqual({ key: 'Content-Type', value: 'application/json' });
  });

  it('is not behind the login redirect in middleware', () => {
    const source = readFileSync(join(root, 'middleware.ts'), 'utf8');
    expect(source).toMatch(/matcher:[\s\S]*\\\.well-known\//);
  });
});

describe('Android app links', () => {
  it('does not publish an assetlinks.json with an invented fingerprint', () => {
    expect(() => readFileSync(join(root, 'public/.well-known/assetlinks.json'), 'utf8')).toThrow();
  });
});
