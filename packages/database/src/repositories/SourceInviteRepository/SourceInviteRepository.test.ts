/**
 * SOURCE_INVITE.md §4.2
 */

import { MongoClient, ObjectId, type Db } from 'mongodb';
import { SOURCE_INVITE_ADAPTER_IDS, type ISourceInvitePayload } from '@scholaracle/contracts';
import { SourceInviteRepository } from './SourceInviteRepository';

const AVA_PAYLOAD: ISourceInvitePayload = {
  provider: 'skyward',
  adapterId: SOURCE_INVITE_ADAPTER_IDS.skyward,
  portalBaseUrl: 'https://skyward.iscorp.com',
  displayName: 'Skyward Family Access (skyward.iscorp.com)',
  studentId: 'stu-mongo-1',
  studentExternalId: 'ava-lewis',
  institutionExternalId: 'skyward.iscorp.com',
};

describe('SourceInviteRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repository: SourceInviteRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_source_invite_test');
    repository = new SourceInviteRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('source_invites').deleteMany({});
  });

  it('insert then findByHash returns payload; document has tokenHash not token', async () => {
    const userId = new ObjectId().toString();
    const now = new Date();
    const inserted = await repository.insert({
      userId,
      tokenHash: 'hash-1',
      payload: AVA_PAYLOAD,
      expiresAt: new Date(now.getTime() + 3600000),
      createdAt: now,
      consumedAt: null,
    });

    const found = await repository.findByHash('hash-1');
    expect(found?.payload).toEqual(AVA_PAYLOAD);
    expect(found?.userId).toBe(userId);
    expect(found?.id).toBe(inserted.id);

    const doc = await database.collection('source_invites').findOne({ tokenHash: 'hash-1' });
    expect(doc).not.toBeNull();
    expect(doc).not.toHaveProperty('token');
    expect(doc?.['tokenHash']).toBe('hash-1');
  });

  it('consumeIfOpen true once, false second time', async () => {
    const now = new Date();
    const inserted = await repository.insert({
      userId: new ObjectId().toString(),
      tokenHash: 'hash-2',
      payload: AVA_PAYLOAD,
      expiresAt: new Date(now.getTime() + 3600000),
      createdAt: now,
      consumedAt: null,
    });
    expect(await repository.consumeIfOpen(inserted.id, now)).toBe(true);
    expect(await repository.consumeIfOpen(inserted.id, now)).toBe(false);
  });

  it('consumeIfOpen is false when expired', async () => {
    const now = new Date();
    const inserted = await repository.insert({
      userId: new ObjectId().toString(),
      tokenHash: 'hash-3',
      payload: AVA_PAYLOAD,
      expiresAt: new Date(now.getTime() - 1000),
      createdAt: now,
      consumedAt: null,
    });
    expect(await repository.consumeIfOpen(inserted.id, now)).toBe(false);
  });

  it('invalidateOpen sets consumedAt on matching open rows only', async () => {
    const now = new Date();
    const userId = new ObjectId().toString();
    const otherUser = new ObjectId().toString();
    await repository.insert({
      userId,
      tokenHash: 'hash-a',
      payload: AVA_PAYLOAD,
      expiresAt: new Date(now.getTime() + 3600000),
      createdAt: now,
      consumedAt: null,
    });
    await repository.insert({
      userId: otherUser,
      tokenHash: 'hash-b',
      payload: AVA_PAYLOAD,
      expiresAt: new Date(now.getTime() + 3600000),
      createdAt: now,
      consumedAt: null,
    });
    const n = await repository.invalidateOpen({
      userId,
      studentId: AVA_PAYLOAD.studentId,
      provider: 'skyward',
      institutionExternalId: AVA_PAYLOAD.institutionExternalId,
      now,
    });
    expect(n).toBe(1);
    expect((await repository.findByHash('hash-a'))?.consumedAt).toEqual(now);
    expect((await repository.findByHash('hash-b'))?.consumedAt).toBeNull();
  });
});
