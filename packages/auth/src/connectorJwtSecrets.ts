const DISTINCT_SECRET_MESSAGE =
  'CONNECTOR_JWT_SECRET must be set to a value different from JWT_SECRET so parent session tokens cannot be used as connector tokens.';

export function assertConnectorJwtSecretDistinctFromUserSecret(
  jwtSecret: string,
  connectorJwtSecret: string
): void {
  if (jwtSecret.trim().length === 0 || connectorJwtSecret.trim().length === 0) {
    throw new Error('JWT_SECRET and CONNECTOR_JWT_SECRET are both required.');
  }
  if (jwtSecret === connectorJwtSecret) {
    throw new Error(DISTINCT_SECRET_MESSAGE);
  }
}

export function resolveConnectorJwtSecret(
  explicit?: string,
  jwtSecret?: string
): string | undefined {
  const fromEnv = process.env['CONNECTOR_JWT_SECRET'];
  if (explicit) return explicit;
  if (fromEnv) return fromEnv;
  return jwtSecret ?? process.env['JWT_SECRET'];
}
