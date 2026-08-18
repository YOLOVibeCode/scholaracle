import { randomBytes, createHash } from 'node:crypto';
import { SOURCE_INVITE_TOKEN_BYTES } from '@scholaracle/contracts';

export interface ITokenGenerator {
  randomHex(nbytes: number): string;
}

export interface ITokenHasher {
  hash(token: string): string;
}

export class CryptoTokenGenerator implements ITokenGenerator {
  randomHex(nbytes: number = SOURCE_INVITE_TOKEN_BYTES): string {
    return randomBytes(nbytes).toString('hex');
  }
}

export class Sha256TokenHasher implements ITokenHasher {
  hash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}

export class FixedTokenGenerator implements ITokenGenerator {
  constructor(private readonly hex: string) {}

  randomHex(nbytes: number): string {
    if (this.hex.length !== nbytes * 2) {
      throw new Error(`Fixed token must be ${nbytes * 2} hex chars`);
    }
    return this.hex;
  }
}
