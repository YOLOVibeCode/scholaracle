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
    expect(source).toMatch(/matcher:.*\\\.well-known\//);
  });
});

describe('Android app links (assetlinks.json)', () => {
  const statements = JSON.parse(
    readFileSync(join(root, 'public/.well-known/assetlinks.json'), 'utf8')
  ) as {
    relation: string[];
    target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
  }[];

  it('lets exactly one app, the Play package, open scholarmancy.com links', () => {
    expect(statements).toHaveLength(1);
    const [statement] = statements;
    expect(statement?.relation).toEqual(['delegate_permission/common.handle_all_urls']);
    expect(statement?.target.namespace).toBe('android_app');
    expect(statement?.target.package_name).toBe('com.scholarmancy.app');
  });

  it('carries the Google Play app-signing certificate, not a placeholder', () => {
    const prints = statements[0]?.target.sha256_cert_fingerprints ?? [];
    // Read from the Play Developer API on 2026-11-12 (generatedApks, versionCode 10).
    expect(prints).toEqual([
      'A0:C8:F4:FF:0D:B7:17:E2:24:CF:C3:09:31:44:F9:29:D4:6D:B7:CE:5E:8D:F0:52:C6:0A:AC:9C:23:E6:6D:6C',
    ]);
    for (const print of prints) {
      expect(print).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    }
  });

  it('matches the package and link the Android app declares', () => {
    const appJson = JSON.parse(
      readFileSync(join(root, '..', 'mobile', 'app.json'), 'utf8')
    ) as {
      expo: {
        android: {
          package: string;
          intentFilters: { autoVerify?: boolean; data: { host: string; pathPrefix: string }[] }[];
        };
      };
    };
    expect(appJson.expo.android.package).toBe(statements[0]?.target.package_name);
    const verified = appJson.expo.android.intentFilters.filter((f) => f.autoVerify === true);
    expect(verified.flatMap((f) => f.data.map((d) => `${d.host}${d.pathPrefix}`))).toEqual([
      'scholarmancy.com/magic',
    ]);
  });

  it('is served as application/json', async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const rule = rules.find((r) => r.source === '/.well-known/assetlinks.json');
    expect(rule?.headers).toContainEqual({ key: 'Content-Type', value: 'application/json' });
  });
});
