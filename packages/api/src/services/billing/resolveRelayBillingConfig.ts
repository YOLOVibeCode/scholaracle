export interface IRelayBillingConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly storeAlias: string;
  readonly webhookSecret?: string;
  readonly webhookCallbackUrl?: string;
}

function defaultStoreAlias(nodeEnv: string): string {
  return nodeEnv === 'production' ? 'scholarmancy' : 'scholarmancy-dev';
}

/** Read relay billing env for store API and webhooks. */
export function resolveRelayBillingConfig(
  env: NodeJS.ProcessEnv = process.env
): IRelayBillingConfig | null {
  const apiKey = env['RELAY_API_KEY'];
  const baseUrl = env['RELAY_API_BASE_URL'];
  if (!apiKey || !baseUrl) {
    return null;
  }
  const nodeEnv = env['NODE_ENV'] ?? 'development';
  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ''),
    storeAlias: env['RELAY_STORE_ALIAS'] ?? defaultStoreAlias(nodeEnv),
    webhookSecret: env['RELAY_WEBHOOK_SECRET'],
    webhookCallbackUrl: env['RELAY_WEBHOOK_CALLBACK_URL'],
  };
}
