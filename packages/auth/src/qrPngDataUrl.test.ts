import { qrPngDataUrl } from './qrPngDataUrl';

describe('qrPngDataUrl', () => {
  it('encodes the payload as a PNG data URL', async () => {
    const url = await qrPngDataUrl('http://localhost:2800/login?magic=once-only');
    expect(url).toMatch(/^data:image\/png;base64,/);
    expect(url.length).toBeGreaterThan(100);
  });
});
