import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { ConnectorDeviceRepository } from './ConnectorDeviceRepository';

describe('ConnectorDeviceRepository', () => {
  jest.setTimeout(60_000);
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let repo: ConnectorDeviceRepository;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('connector-device-test');
    repo = new ConnectorDeviceRepository(database);
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await database.collection('slc_devices').deleteMany({});
  });

  it('upserts active token per device', async () => {
    const device = await repo.upsertActiveToken({
      userId: 'user-1',
      deviceId: 'phone-a',
      activeJti: 'jti-1',
    });
    expect(device.deviceId).toBe('phone-a');
    expect(device.hasActiveJti('jti-1')).toBe(true);

    const loaded = await repo.findByUserAndDevice('user-1', 'phone-a');
    expect(loaded?.activeJti).toBe('jti-1');
  });

  it('keeps separate devices for the same user', async () => {
    await repo.upsertActiveToken({ userId: 'user-1', deviceId: 'a', activeJti: 'jti-a' });
    await repo.upsertActiveToken({ userId: 'user-1', deviceId: 'b', activeJti: 'jti-b' });

    const devA = await repo.findByUserAndDevice('user-1', 'a');
    const devB = await repo.findByUserAndDevice('user-1', 'b');
    expect(devA?.activeJti).toBe('jti-a');
    expect(devB?.activeJti).toBe('jti-b');
  });

  it('revokeDevice marks device revoked and returns prior jti', async () => {
    await repo.upsertActiveToken({ userId: 'user-1', deviceId: 'cli', activeJti: 'jti-cli' });
    const revokedJti = await repo.revokeDevice('user-1', 'cli');
    expect(revokedJti).toBe('jti-cli');

    const loaded = await repo.findByUserAndDevice('user-1', 'cli');
    expect(loaded?.isRevoked).toBe(true);
    expect(loaded?.hasActiveJti('jti-cli')).toBe(false);
  });
});
