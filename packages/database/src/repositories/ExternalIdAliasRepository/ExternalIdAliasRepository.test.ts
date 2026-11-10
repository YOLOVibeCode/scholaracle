/**
 * ExternalIdAliasRepository — built-in adapterId alias store.
 */

import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ExternalIdAliasRepository } from './ExternalIdAliasRepository';

describe('ExternalIdAliasRepository', () => {
  let memoryServer: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let repository: ExternalIdAliasRepository;

  beforeAll(async () => {
    memoryServer = await MongoMemoryServer.create();
    client = new MongoClient(memoryServer.getUri());
    await client.connect();
    database = client.db('test');
  }, 60_000);

  afterAll(async () => {
    await client.close();
    await memoryServer.stop();
  });

  beforeEach(async () => {
    await database.collection('slc_external_id_aliases').deleteMany({});
    repository = new ExternalIdAliasRepository(database);
  });

  it('upserts builtin adapter aliases and resolves canonical ids', async () => {
    const map = {
      'com.instructure.canvas': 'canvas',
      canvas: 'canvas',
      'com.skyward.iscorp': 'skyward',
    } as const;
    const count = await repository.upsertBuiltinAdapterAliases(map);
    expect(count).toBe(3);

    expect(await repository.resolveAdapterId('com.instructure.canvas')).toBe('canvas');
    expect(await repository.resolveAdapterId('com.hobbyist.custom')).toBe('com.hobbyist.custom');
  });
});
