import { ASSET_URL_TTL_SECONDS, signAssetUrl, verifyAssetSignature } from './signedUrl';

const SECRET = 'signed-url-test-secret';
const ASSET_ID = 'demo-asset-demo-emma-ap-bio-lab-safety';

describe('signAssetUrl / verifyAssetSignature', () => {
  it('signs a 24h ticket with sig and exp, never a forever URL', () => {
    const before = Math.floor(Date.now() / 1000);
    const url = signAssetUrl('http://test.example', ASSET_ID, SECRET);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe(`/api/assets/${ASSET_ID}`);
    const sig = parsed.searchParams.get('sig');
    const exp = Number(parsed.searchParams.get('exp'));
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    expect(exp).toBeGreaterThanOrEqual(before + ASSET_URL_TTL_SECONDS - 1);
    expect(exp).toBeLessThanOrEqual(before + ASSET_URL_TTL_SECONDS + 2);
    expect(verifyAssetSignature(ASSET_ID, sig ?? '', exp, SECRET)).toBe(true);
  });

  it('rejects an expired signature', () => {
    const url = signAssetUrl('http://test.example', ASSET_ID, SECRET, -30);
    const parsed = new URL(url);
    const sig = parsed.searchParams.get('sig') ?? '';
    const exp = parsed.searchParams.get('exp') ?? '';
    expect(verifyAssetSignature(ASSET_ID, sig, exp, SECRET)).toBe(false);
  });

  it('rejects a signature for a different assetId', () => {
    const url = signAssetUrl('http://test.example', ASSET_ID, SECRET);
    const parsed = new URL(url);
    const sig = parsed.searchParams.get('sig') ?? '';
    const exp = parsed.searchParams.get('exp') ?? '';
    expect(verifyAssetSignature('someone-elses-asset', sig, exp, SECRET)).toBe(false);
  });
});
