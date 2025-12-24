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

    const approved = await repo.approveByUserCode('USER-1234', 'user-id-1', 'token-abc');
    expect(approved).toBe(true);

    const firstPoll = await repo.deliverTokenOnce('dev-1');
    expect(firstPoll.status).toBe('approved');
    expect(firstPoll.token).toBe('token-abc');

    const secondPoll = await repo.deliverTokenOnce('dev-1');
    expect(secondPoll.status).toBe('approved');
    expect(secondPoll.token).toBeUndefined();
  });
});


