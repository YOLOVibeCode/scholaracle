export class AssetCacheError extends Error {
  public readonly code: 'NETWORK' | 'NOT_IN_CACHE' | 'MISSING_URL';

  constructor(code: 'NETWORK' | 'NOT_IN_CACHE' | 'MISSING_URL', message: string) {
    super(message);
    this.name = 'AssetCacheError';
    this.code = code;
  }
}
