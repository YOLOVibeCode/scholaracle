export interface INoctusoftStoreConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly webhookSecret: string;
  readonly storeAlias: string;
  readonly storeMode: 'test' | 'live';
}

/**
 * The store mode this environment trades in: RELAY_STORE_MODE when set,
 * otherwise live in production and test everywhere else.
 */
export function resolveStoreMode(env: NodeJS.ProcessEnv = process.env): 'test' | 'live' {
  const explicit = env['RELAY_STORE_MODE'];
  if (explicit === 'live' || explicit === 'test') {
    return explicit;
  }
  return env['NODE_ENV'] === 'production' ? 'live' : 'test';
}

/** Reads Noctusoft store relay env; throws when required billing keys are missing. */
export function resolveNoctusoftStoreConfig(
  env: NodeJS.ProcessEnv = process.env
): INoctusoftStoreConfig | null {
  const apiKey = env['RELAY_API_KEY'];
  const webhookSecret = env['RELAY_WEBHOOK_SECRET'];
  const storeAlias = env['RELAY_STORE_ALIAS'];
  if (!apiKey || !webhookSecret || !storeAlias) {
    return null;
  }
  const baseUrl = (env['RELAY_URL'] ?? 'https://store.noctusoft.com').replace(/\/$/, '');
  return {
    baseUrl,
    apiKey,
    webhookSecret,
    storeAlias,
    storeMode: resolveStoreMode(env),
  };
}

/** True when checkout + billing routes can be mounted. */
export function isNoctusoftBillingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const cfg = resolveNoctusoftStoreConfig(env);
  return cfg !== null;
}
