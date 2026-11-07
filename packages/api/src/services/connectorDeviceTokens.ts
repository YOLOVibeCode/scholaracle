import { randomUUID } from 'node:crypto';
import type { Collection, Db } from 'mongodb';
import type { ConnectorTokenService } from '@scholaracle/auth';
import { ConnectorDeviceRepository } from '@scholaracle/database';
import type { IConnectorTokenResponse } from '@scholaracle/contracts';

interface IRevokedConnectorTokenDoc {
  readonly userId: string;
  readonly jti: string;
  readonly deviceId?: string;
  readonly tokenPurpose: 'scraper';
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
}

function revokedTokensCollection(database: Db): Collection<IRevokedConnectorTokenDoc> {
  return database.collection<IRevokedConnectorTokenDoc>('revoked_connector_tokens');
}

async function markJtiRevoked(
  collection: Collection<IRevokedConnectorTokenDoc>,
  jti: string
): Promise<void> {
  await collection.updateOne({ jti }, { $set: { revokedAt: new Date() } });
}

async function recordActiveJti(
  collection: Collection<IRevokedConnectorTokenDoc>,
  userId: string,
  deviceId: string,
  jti: string
): Promise<void> {
  await collection.insertOne({
    userId,
    jti,
    deviceId,
    tokenPurpose: 'scraper',
    createdAt: new Date(),
    revokedAt: null,
  });
}

export async function mintConnectorTokenForDevice(params: {
  readonly database: Db;
  readonly connectorTokenService: ConnectorTokenService;
  readonly userId: string;
  readonly deviceId: string;
}): Promise<IConnectorTokenResponse> {
  const deviceRepo = new ConnectorDeviceRepository(params.database);
  const revoked = revokedTokensCollection(params.database);

  const existing = await deviceRepo.findByUserAndDevice(params.userId, params.deviceId);
  if (existing?.activeJti) {
    await markJtiRevoked(revoked, existing.activeJti);
  }

  const jti = randomUUID();
  const token = params.connectorTokenService.createToken(params.userId, jti, params.deviceId);
  await deviceRepo.upsertActiveToken({
    userId: params.userId,
    deviceId: params.deviceId,
    activeJti: jti,
  });
  await recordActiveJti(revoked, params.userId, params.deviceId, jti);

  return {
    success: true,
    token,
    jti,
    deviceId: params.deviceId,
    expiresIn: params.connectorTokenService.expiresInLabel,
  };
}

export async function revokeConnectorDevice(params: {
  readonly database: Db;
  readonly userId: string;
  readonly deviceId: string;
}): Promise<boolean> {
  const deviceRepo = new ConnectorDeviceRepository(params.database);
  const jti = await deviceRepo.revokeDevice(params.userId, params.deviceId);
  if (!jti) return false;
  await markJtiRevoked(revokedTokensCollection(params.database), jti);
  return true;
}
