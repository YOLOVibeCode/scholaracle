import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import type { IAppleProof } from './appleDeleteRequest';

export type { IAppleProof } from './appleDeleteRequest';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when this device can run the Sign in with Apple sheet. */
export async function isAppleProofAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Run a FRESH Sign in with Apple and return the identity token + raw nonce, to prove to the server
 * who is at the keyboard (account deletion for accounts that have no password), plus the
 * one-time authorization code the server needs to revoke the user's Apple tokens.
 * Returns null when the user cancels.
 */
export async function requestAppleProof(): Promise<IAppleProof | null> {
  const nonce = toHex(await Crypto.getRandomBytesAsync(16));
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  try {
    const credential = await AppleAuthentication.signInAsync({ nonce: hashed });
    if (credential.identityToken === null || credential.identityToken === '') {
      throw new Error('Apple did not return an identity token');
    }
    const code = credential.authorizationCode;
    return {
      identityToken: credential.identityToken,
      nonce,
      authorizationCode: typeof code === 'string' && code !== '' ? code : null,
    };
  } catch (err: unknown) {
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'ERR_REQUEST_CANCELED'
    ) {
      return null;
    }
    throw err;
  }
}
