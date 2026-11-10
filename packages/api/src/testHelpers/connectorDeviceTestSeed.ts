import type { Db } from 'mongodb';
import { ConnectorDeviceRepository } from '@scholaracle/database';

/** Registers a connector jti as active for integration tests that mint JWTs directly. */
export async function seedActiveConnectorJti(
  database: Db,
  userId: string,
  deviceId: string,
  jti: string
): Promise<void> {
  await new ConnectorDeviceRepository(database).upsertActiveToken({
    userId,
    deviceId,
    activeJti: jti,
  });
  await database.collection('revoked_connector_tokens').insertOne({
    userId,
    jti,
    deviceId,
    tokenPurpose: 'scraper',
    createdAt: new Date(),
    revokedAt: null,
  });
}
