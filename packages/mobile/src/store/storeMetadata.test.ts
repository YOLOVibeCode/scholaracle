import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DEMO_PASSWORD } from '../demo/demoLogin';
import { STORE_LEGAL_URLS } from './legalUrls';

describe('App Store metadata URLs', () => {
  const listing = JSON.parse(
    readFileSync(join(__dirname, '../../store-metadata/en-US.json'), 'utf8')
  ) as {
    privacyPolicyUrl: string;
    supportUrl: string;
    marketingUrl: string;
  };
  const testflight = JSON.parse(
    readFileSync(join(__dirname, '../../store-metadata/testflight.json'), 'utf8')
  ) as {
    privacyPolicyUrl: string;
    supportUrl: string;
    marketingUrl: string;
    demoAccountName: string;
    demoAccountRequired: boolean;
  };

  it('listing, TestFlight, and in-app Settings agree on the live legal URLs', () => {
    expect(listing.privacyPolicyUrl).toBe(STORE_LEGAL_URLS.privacy);
    expect(listing.supportUrl).toBe(STORE_LEGAL_URLS.support);
    expect(listing.marketingUrl).toBe(STORE_LEGAL_URLS.marketing);
    expect(testflight.privacyPolicyUrl).toBe(STORE_LEGAL_URLS.privacy);
    expect(testflight.supportUrl).toBe(STORE_LEGAL_URLS.support);
    expect(testflight.marketingUrl).toBe(STORE_LEGAL_URLS.marketing);
  });

  it('TestFlight demo account is the public seeded parent', () => {
    expect(testflight.demoAccountRequired).toBe(true);
    expect(testflight.demoAccountName).toBe('demo@scholarmancy.com');
  });
});

/**
 * The sign-in Apple's beta review uses.
 *
 * The production API keeps the demo parent's password private (DEMO_ACCOUNT_PASSWORD) and
 * does not accept the documented local one. Until 25 Nov 2026 testflight.json held the local
 * password, and `pnpm sync:testflight` pushed it to App Store Connect and printed it.
 * The password now comes from the environment, read from the vault at run time.
 */
describe('TestFlight review sign-in', () => {
  const metaPath = join(__dirname, '../../store-metadata/testflight.json');
  const scriptPath = join(__dirname, '../../scripts/sync-app-store-connect.mjs');
  const raw = readFileSync(metaPath, 'utf8');
  const meta = JSON.parse(raw) as Record<string, unknown>;

  /** Made-up values for these tests. Neither is, or resembles, a real password. */
  const FAKE_TOO_SHORT = 'fake-short';
  const FAKE_LONG_ENOUGH = 'fake-value-for-these-tests-0123456789';

  /** Runs the sync script in check mode: it validates its inputs and sends nothing. */
  function runCheck(env: Record<string, string>): { status: number | null; output: string } {
    // A clean environment: nothing from the machine running the tests reaches the script.
    const result = spawnSync(process.execPath, [scriptPath, '--check'], {
      encoding: 'utf8',
      env: { NODE_ENV: 'test', PATH: process.env['PATH'] ?? '', ...env },
    });
    return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
  }

  it('keeps no password in the tracked file', () => {
    expect(Object.keys(meta).filter((key) => /password/i.test(key))).toEqual([]);
    expect(raw).not.toContain(DEMO_PASSWORD);
    expect(String(meta['reviewNotes'])).not.toMatch(/^\s*password\s*:/im);
  });

  it('tells the reviewer where the sign-in is', () => {
    expect(String(meta['reviewNotes'])).toMatch(/sign-in fields/i);
  });

  it('does not tell testers to use a sign-in only the reviewer can see', () => {
    expect(String(meta['betaDescription'])).not.toMatch(/demo parent/i);
    expect(String(meta['betaDescription'])).not.toMatch(/Beta App Review Information/i);
  });

  it('without a password, leaves the sign-in on App Store Connect as it is', () => {
    // The build scripts run this at their end; they must not replace a working sign-in.
    const { status, output } = runCheck({});
    expect(status).toBe(0);
    expect(output).toMatch(/left as it is/i);
    expect(output).toContain('DEMO_ACCOUNT_PASSWORD');
  });

  it('refuses a password the API would ignore (under 12 characters)', () => {
    expect(FAKE_TOO_SHORT.length).toBeLessThan(12);
    const { status, output } = runCheck({ DEMO_ACCOUNT_PASSWORD: FAKE_TOO_SHORT });
    expect(status).toBe(1);
    expect(output).toContain('DEMO_ACCOUNT_PASSWORD');
    expect(output).not.toContain(FAKE_TOO_SHORT);
  });

  it('refuses the documented local password, which the live server does not accept', () => {
    const { status, output } = runCheck({ DEMO_ACCOUNT_PASSWORD: DEMO_PASSWORD });
    expect(status).toBe(1);
    expect(output).not.toContain(DEMO_PASSWORD);
  });

  it('takes the password from the environment and never prints it', () => {
    const { status, output } = runCheck({ DEMO_ACCOUNT_PASSWORD: FAKE_LONG_ENOUGH });
    expect(output).not.toContain(FAKE_LONG_ENOUGH);
    expect(output).toContain(`(${FAKE_LONG_ENOUGH.length} characters)`);
    expect(status).toBe(0);
    expect(output).toContain('demo@scholarmancy.com');
    expect(output).toMatch(/nothing was sent/i);
  });
});
