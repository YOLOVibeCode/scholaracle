export function magicTokenFromSearchParam(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function storageKey(token: string): string {
  return `scholaracle-magic:${token}`;
}

export function claimMagicTokenOnce(
  token: string,
  storage: Pick<Storage, 'getItem' | 'setItem'>
): boolean {
  const key = storageKey(token);
  if (storage.getItem(key) !== null) {
    return false;
  }
  storage.setItem(key, '1');
  return true;
}

export function releaseMagicTokenClaim(
  token: string,
  storage: Pick<Storage, 'removeItem'>
): void {
  storage.removeItem(storageKey(token));
}
