/**
 * Regression for the rawbody suite flake (CI run 43066541310, attempt 1): createApp() starts
 * background Mongo work (index builds) that nothing awaits. When a test file closes its client
 * right after building the app, that work hits a closed pool and surfaces as
 * "Test suite failed to run: MongoPoolClosedError" even though every test passed.
 *
 * This test closes the client immediately after createApp() on purpose, so the race is the
 * normal case here, not a one-in-fifty CI accident. It must stay green.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { createApp } from '../../../server';

describe('createApp teardown', () => {
  jest.setTimeout(60_000);

  let mongoServer: MongoMemoryServer;
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown): void => {
    unhandled.push(reason);
  };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.on('unhandledRejection', onUnhandled);
  });

  afterAll(async () => {
    process.off('unhandledRejection', onUnhandled);
    await mongoServer.stop();
  });

  it('closing the client right after createApp leaves no unhandled rejection', async () => {
    const client = new MongoClient(mongoServer.getUri());
    await client.connect();
    const database = client.db('scholaracle_test_noctusoft_teardown');

    createApp(
      {
        relayApiKey: 'nsk_test',
        relayWebhookSecret: 'test-webhook-secret',
        relayStoreAlias: 'scholarmancy',
        relayStoreMode: 'test',
      },
      database
    );
    await client.close();

    // Let any in-flight background promise reject and the runtime report it.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(
      unhandled.map((reason) => (reason instanceof Error ? reason.name : String(reason)))
    ).toEqual([]);
  });
});
