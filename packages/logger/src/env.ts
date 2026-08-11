/**
 * Single source of truth for NODE_ENV branching across backend services.
 */
export function getNodeEnv(): string {
  return process.env['NODE_ENV'] ?? 'development';
}

export function isProductionEnv(): boolean {
  return getNodeEnv() === 'production';
}

export function isTestEnv(): boolean {
  return getNodeEnv() === 'test';
}

export function isDevelopmentEnv(): boolean {
  return !isProductionEnv() && !isTestEnv();
}
