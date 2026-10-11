import { SMS_STOP_SUFFIX } from '@scholaracle/contracts';
import { ensureBrandSmsBody } from './ensureBrandPrefix';

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
});
