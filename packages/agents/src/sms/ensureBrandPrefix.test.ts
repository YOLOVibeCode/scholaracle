import { SMS_OPT_IN_CONFIRMATION_MESSAGE, SMS_STOP_SUFFIX } from '@scholaracle/contracts';
import { ensureBrandSmsBody } from './ensureBrandPrefix';
import { isGsm7 } from './gsm7';

describe('ensureBrandSmsBody', () => {
  it('prefixes the brand and ends with STOP language', () => {
    expect(ensureBrandSmsBody('Emma has 2 missing assignments.')).toBe(
      `Scholarmancy: Emma has 2 missing assignments. ${SMS_STOP_SUFFIX}`
    );
  });

  it('does not double the brand or the STOP language', () => {
    const body = 'Scholarmancy: Quiz tomorrow. Reply STOP to opt out.';
    expect(ensureBrandSmsBody(body)).toBe(body);
  });

  it('keeps the STOP language when it shortens a long text to one segment', () => {
    const out = ensureBrandSmsBody(`Grade update: ${'x'.repeat(300)}`);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.startsWith('Scholarmancy: Grade update: ')).toBe(true);
    expect(out.endsWith(`... ${SMS_STOP_SUFFIX}`)).toBe(true);
  });

  it('rewrites every text to GSM-7 so one stray character cannot force UCS-2', () => {
    const out = ensureBrandSmsBody('Your sign-in link (expires in 24h) \u2014 tap it\u2026');
    expect(out).toBe(
      `Scholarmancy: Your sign-in link (expires in 24h) - tap it... ${SMS_STOP_SUFFIX}`
    );
    expect(isGsm7(out)).toBe(true);
  });

  it('never cuts a link, even if the text needs a second segment', () => {
    const url = `https://example.com/magic?token=${'a'.repeat(120)}`;
    expect(ensureBrandSmsBody(`Sign-in link: ${url}`)).toBe(
      `Scholarmancy: Sign-in link: ${url} ${SMS_STOP_SUFFIX}`
    );
  });

  it('sends the opt-in confirmation unchanged, in one GSM-7 segment', () => {
    const out = ensureBrandSmsBody(SMS_OPT_IN_CONFIRMATION_MESSAGE);
    expect(out).toBe(SMS_OPT_IN_CONFIRMATION_MESSAGE);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(isGsm7(out)).toBe(true);
  });
});
