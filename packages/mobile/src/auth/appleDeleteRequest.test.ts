import * as fs from 'node:fs';
import * as path from 'node:path';
import { appleDeleteRequest } from './appleDeleteRequest';

describe('appleDeleteRequest', () => {
  it('sends the authorization code so the server can revoke the Apple tokens', () => {
    expect(
      appleDeleteRequest({
        identityToken: 'apple.jwt',
        nonce: 'raw-nonce',
        authorizationCode: 'c1',
      })
    ).toEqual({
      appleIdentityToken: 'apple.jwt',
      appleNonce: 'raw-nonce',
      appleAuthorizationCode: 'c1',
    });
  });

  it.each([null, ''])('leaves the code out when Apple returned none (%p)', (authorizationCode) => {
    const body = appleDeleteRequest({
      identityToken: 'apple.jwt',
      nonce: 'raw-nonce',
      authorizationCode,
    });
    expect(body).toEqual({ appleIdentityToken: 'apple.jwt', appleNonce: 'raw-nonce' });
    expect(body).not.toHaveProperty('appleAuthorizationCode');
  });
});

describe('wiring (source-level; the repo has no RN render harness)', () => {
  const read = (...p: string[]): string =>
    fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

  it('the Apple proof carries the authorization code from the same sign-in', () => {
    const src = read('auth', 'appleProof.ts');
    expect(src).toContain('credential.authorizationCode');
    expect(src).toMatch(
      /authorizationCode: typeof code === 'string' && code !== '' \? code : null/
    );
  });

  it('the delete sheet builds its request from the whole proof', () => {
    const src = read('screens', 'DeleteAccountSheet.tsx');
    expect(src).toContain('await run(appleDeleteRequest(proof))');
    // The old call dropped the code: only the token and nonce were sent.
    expect(src).not.toContain('appleNonce: proof.nonce');
  });
});
