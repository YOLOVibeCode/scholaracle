import {
  isNoctusoftBillingEnabled,
  resolveNoctusoftStoreConfig,
} from './resolveNoctusoftStoreConfig';

describe('resolveNoctusoftStoreConfig', () => {
  it('returns null when relay keys are missing', () => {
    expect(resolveNoctusoftStoreConfig({})).toBeNull();
    expect(isNoctusoftBillingEnabled({})).toBe(false);
  });

  it('parses full config with defaults', () => {
    const cfg = resolveNoctusoftStoreConfig({
      RELAY_API_KEY: 'nsk_x',
      RELAY_WEBHOOK_SECRET: 'whsec',
      RELAY_STORE_ALIAS: 'scholarmancy-dev',
      RELAY_STORE_MODE: 'test',
    });
    expect(cfg).toMatchObject({
      baseUrl: 'https://store.noctusoft.com',
      apiKey: 'nsk_x',
      storeAlias: 'scholarmancy-dev',
      storeMode: 'test',
    });
  });
});
