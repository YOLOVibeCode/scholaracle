import type { ILmsCredentials, ILmsAdapter, LmsAdapterFactory } from './adapter';

/**
 * Registry that maps provider::adapterId keys to adapter factories.
 */
export class AdapterRegistry {
  private readonly _factories = new Map<string, LmsAdapterFactory>();

  private _makeKey(provider: string, adapterId: string): string {
    return `${provider}::${adapterId}`;
  }

  public register(provider: string, adapterId: string, factory: LmsAdapterFactory): void {
    this._factories.set(this._makeKey(provider, adapterId), factory);
  }

  public has(provider: string, adapterId: string): boolean {
    return this._factories.has(this._makeKey(provider, adapterId));
  }

  public create(provider: string, adapterId: string, credentials: ILmsCredentials): ILmsAdapter {
    const factory = this._factories.get(this._makeKey(provider, adapterId));
    if (!factory) {
      throw new Error(`No adapter registered for ${provider}::${adapterId}`);
    }
    return factory(credentials);
  }
}
