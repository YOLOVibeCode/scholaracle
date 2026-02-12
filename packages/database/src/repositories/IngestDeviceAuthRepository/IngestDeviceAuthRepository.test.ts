import { MongoClient, type Db } from 'mongodb';
import { IngestDeviceAuthRepository } from './IngestDeviceAuthRepository';

describe('IngestDeviceAuthRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repo: IngestDeviceAuthRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repo = new IngestDeviceAuthRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('slc_device_auth').deleteMany({});
  });

  it('creates a pending device auth record', async () => {
    const created = await repo.createPending({
      deviceCode: 'dev-1',
      userCode: 'USER-1234',
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(created.deviceCode).toBe('dev-1');
    expect(created.userCode).toBe('USER-1234');
    expect(created.status).toBe('pending');
  });

  it('approves by user code and delivers token once', async () => {
    await repo.createPending({
      deviceCode: 'dev-1',
      userCode: 'USER-1234',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const isApproved = await repo.approveByUserCode('USER-1234', 'user-id-1', 'token-abc');
    expect(isApproved).toBe(true);

    const firstPoll = await repo.deliverTokenOnce('dev-1');
    expect(firstPoll.status).toBe('approved');
    expect(firstPoll.token).toBe('token-abc');

    const secondPoll = await repo.deliverTokenOnce('dev-1');
    expect(secondPoll.status).toBe('approved');
    expect(secondPoll.token).toBeUndefined();
  });

  it('finds by device code', async () => {
    await repo.createPending({
      deviceCode: 'dev-find',
      userCode: 'USER-FIND',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const found = await repo.findByDeviceCode('dev-find');

    expect(found).not.toBeNull();
    expect(found!.deviceCode).toBe('dev-find');
    expect(found!.userCode).toBe('USER-FIND');
    expect(found!.status).toBe('pending');
    expect(found!._id).toBeDefined();
  });

  it('returns null for non-existent device code', async () => {
    const found = await repo.findByDeviceCode('no-such-device');

    expect(found).toBeNull();
  });

  it('marks a device as expired', async () => {
    await repo.createPending({
      deviceCode: 'dev-expire',
      userCode: 'USER-EXPIRE',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await repo.markExpired('dev-expire');

    const found = await repo.findByDeviceCode('dev-expire');
    expect(found).not.toBeNull();
    expect(found!.status).toBe('expired');
  });

  it('returns false when approving non-existent user code', async () => {
    const result = await repo.approveByUserCode('NO-SUCH-CODE', 'user-1', 'token-1');

    expect(result).toBe(false);
  });

  it('returns false when approving already-expired device', async () => {
    await repo.createPending({
      deviceCode: 'dev-past',
      userCode: 'USER-PAST',
      expiresAt: new Date(Date.now() - 60_000),
    });

    const result = await repo.approveByUserCode('USER-PAST', 'user-1', 'token-1');

    expect(result).toBe(false);
  });

  it('returns expired status for non-existent device in deliverTokenOnce', async () => {
    const result = await repo.deliverTokenOnce('ghost-device');

    expect(result.status).toBe('expired');
    expect(result.token).toBeUndefined();
  });

  it('auto-expires pending device past expiresAt on poll', async () => {
    await repo.createPending({
      deviceCode: 'dev-auto-expire',
      userCode: 'USER-AUTO',
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await repo.deliverTokenOnce('dev-auto-expire');

    expect(result.status).toBe('expired');
    expect(result.token).toBeUndefined();

    const found = await repo.findByDeviceCode('dev-auto-expire');
    expect(found!.status).toBe('expired');
  });
});
