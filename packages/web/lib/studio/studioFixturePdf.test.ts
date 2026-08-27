import { studioFixturePdf } from './studioFixturePdf';
import { EMMA_LAB_SAFETY_HASH, EMMA_LAB_SAFETY_PDF_V1 } from '@scholaracle/studio-core';

describe('studioFixturePdf', () => {
  it('serves lab-safety.pdf with ETag matching the Emma fixture hash', () => {
    const res = studioFixturePdf('lab-safety.pdf', null);
    expect(res.status).toBe(200);
    expect(res.headers['ETag']).toBe(`"${EMMA_LAB_SAFETY_HASH}"`);
    expect(res.body).toEqual(EMMA_LAB_SAFETY_PDF_V1);
  });

  it('returns 304 when If-None-Match matches the quoted hash', () => {
    const res = studioFixturePdf('lab-safety.pdf', `"${EMMA_LAB_SAFETY_HASH}"`);
    expect(res.status).toBe(304);
    expect(res.body).toBeNull();
  });

  it('returns 404 for unknown files', () => {
    expect(studioFixturePdf('nope.pdf', null).status).toBe(404);
  });
});
