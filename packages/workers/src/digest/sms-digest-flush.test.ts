/**
 * The daily text summary: one text per person for the alerts that waited since the last one.
 *
 * These tests run the real flusher against a real (in-memory) database. Only the sender is
 * faked, so no text leaves the machine.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { SmsDigestPendingRepository } from '@scholaracle/database';
import { SmsNotSentError, type GuardedSmsSender } from '@scholaracle/agents';
import { logger } from '../logger';
import {
  SmsDigestFlusher,
  SMS_DIGEST_MAX_AGE_MS,
  SMS_DIGEST_MIN_GAP_MS,
  SMS_DIGEST_RETRY_WAIT_MS,
} from './sms-digest-flush';

const NOW = new Date('2026-11-27T18:00:00Z');
const MINUTE = 60_000;
const OWNER = 'account-owner';
const OTHER = 'account-other';
const OWNER_PHONE = '+15125550100';
const OTHER_PHONE = '+15125550111';

/** Everything written to the log, as one string. */
function logged(...spies: jest.SpyInstance[]): string {
  return JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
}

describe('the daily text summary', () => {
  let mongo: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  let pending: SmsDigestPendingRepository;
  let send: jest.Mock;
  let info: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    client = new MongoClient(mongo.getUri());
    await client.connect();
    db = client.db('sms_digest_flush_test');
  });

  afterAll(async () => {
    await client.close();
    await mongo.stop();
  });

  beforeEach(async () => {
    await db.collection('sms_digest_pending').deleteMany({});
    await db.collection('communication_logs').deleteMany({});
    pending = new SmsDigestPendingRepository(db);
    send = jest.fn().mockResolvedValue({ messageId: 'SMdigest' });
    info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function flusher(): SmsDigestFlusher {
    return new SmsDigestFlusher(db, { sendTransactional: send } as unknown as GuardedSmsSender, {
      webOrigin: 'https://scholarmancy.com',
    });
  }

  async function alertWaits(
    userId: string,
    phone: string,
    minutesAgo: number,
    from: Date = NOW
  ): Promise<void> {
    await pending.add({
      userId,
      phone,
      subject: 'Grade drop',
      body: 'Math fell to 72%.',
      createdAt: new Date(from.getTime() - minutesAgo * MINUTE),
    });
  }

  const waitingFor = (userId: string): Promise<number> =>
    db.collection('sms_digest_pending').countDocuments({ userId });

  const logRows = (): Promise<Record<string, unknown>[]> =>
    db.collection('communication_logs').find({}).toArray();

  it('sends each person one text that counts their alerts, and then forgets them', async () => {
    await alertWaits(OWNER, OWNER_PHONE, 300);
    await alertWaits(OWNER, OWNER_PHONE, 200);
    await alertWaits(OWNER, OWNER_PHONE, 100);
    await alertWaits(OTHER, OTHER_PHONE, 50);

    const tally = await flusher().flush(NOW);

    expect(tally).toEqual({ sent: 2, dropped: 0, waiting: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(
      OWNER_PHONE,
      'Scholarmancy: Your daily summary: 3 new alerts. Details: https://scholarmancy.com/alerts Reply STOP to opt out.',
      expect.objectContaining({
        userId: OWNER,
        templateName: 'sms_digest',
        triggeredBy: 'scheduled',
      })
    );
    expect(send).toHaveBeenCalledWith(
      OTHER_PHONE,
      expect.stringContaining('1 new alert.'),
      expect.objectContaining({ userId: OTHER })
    );
    expect(await waitingFor(OWNER)).toBe(0);
    expect(await waitingFor(OTHER)).toBe(0);
  });

  it('texts the number of the newest alert, in case the person changed it', async () => {
    await alertWaits(OWNER, '+15125550999', 300);
    await alertWaits(OWNER, OWNER_PHONE, 10);

    await flusher().flush(NOW);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toBe(OWNER_PHONE);
  });

  it('keeps an alert that arrives while the summary is on its way for the next summary', async () => {
    await alertWaits(OWNER, OWNER_PHONE, 100);
    send.mockImplementation(async () => {
      await pending.add({
        userId: OWNER,
        phone: OWNER_PHONE,
        subject: 'Missing work',
        body: 'Lab 4 is missing.',
        createdAt: new Date(NOW.getTime() + 1000),
      });
      return { messageId: 'SMdigest' };
    });

    await flusher().flush(NOW);

    expect(send.mock.calls[0]![1]).toContain('1 new alert.');
    expect(await waitingFor(OWNER)).toBe(1);
  });

  it('sends a person one summary a day: an alert that arrives later in the hour waits for the next day', async () => {
    await alertWaits(OWNER, OWNER_PHONE, 100);
    const digests = flusher();

    await digests.flush(NOW);
    const tenPast = new Date(NOW.getTime() + 10 * MINUTE);
    await alertWaits(OWNER, OWNER_PHONE, 0, tenPast);
    // The schedule calls every minute of the hour.
    let laterThatHour = { sent: 0, dropped: 0, waiting: 0 };
    for (let minute = 11; minute < 60; minute += 1) {
      laterThatHour = await digests.flush(new Date(NOW.getTime() + minute * MINUTE));
    }

    expect(laterThatHour).toEqual({ sent: 0, dropped: 0, waiting: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(await waitingFor(OWNER)).toBe(1);

    const nextDay = await digests.flush(new Date(NOW.getTime() + 24 * 60 * MINUTE));

    expect(nextDay).toEqual({ sent: 1, dropped: 0, waiting: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(await waitingFor(OWNER)).toBe(0);
  });

  it('drops the alerts of a number that cannot be texted, and says so once', async () => {
    await alertWaits(OWNER, OWNER_PHONE, 100);
    await alertWaits(OWNER, OWNER_PHONE, 50);
    send.mockRejectedValue(new SmsNotSentError('opted_out', 'recipient'));
    const digests = flusher();

    const tally = await digests.flush(NOW);
    await digests.flush(new Date(NOW.getTime() + MINUTE));

    expect(tally).toEqual({ sent: 0, dropped: 1, waiting: 0 });
    // Trying again would end the same way: asked once, and nothing is left to ask about.
    expect(send).toHaveBeenCalledTimes(1);
    expect(await waitingFor(OWNER)).toBe(0);

    // Nor is the number asked about again that day, when another alert comes in.
    await alertWaits(OWNER, OWNER_PHONE, 0, new Date(NOW.getTime() + 2 * MINUTE));
    await digests.flush(new Date(NOW.getTime() + 3 * MINUTE));
    expect(send).toHaveBeenCalledTimes(1);
    expect(await waitingFor(OWNER)).toBe(1);

    const rows = await logRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: OWNER,
      channel: 'sms',
      status: 'failed',
      failureReason: 'opted_out',
      templateName: 'sms_digest',
    });
    expect(warn).toHaveBeenCalledWith(
      { job: 'sms-digest', userId: OWNER, reason: 'opted_out', alerts: 2 },
      'daily text summary dropped: this number cannot be texted'
    );
  });

  it('asks about a number that cannot be texted once a day, not once for every new alert', async () => {
    await alertWaits(OWNER, OWNER_PHONE, 100);
    send.mockRejectedValue(new SmsNotSentError('no_consent', 'recipient'));
    const digests = flusher();

    await digests.flush(NOW);
    const fivePast = new Date(NOW.getTime() + 5 * MINUTE);
    await alertWaits(OWNER, OWNER_PHONE, 0, fivePast);
    await digests.flush(new Date(NOW.getTime() + 6 * MINUTE));

    expect(send).toHaveBeenCalledTimes(1);
    expect(await waitingFor(OWNER)).toBe(1);
    expect(await logRows()).toHaveLength(1);

    // By the next day the person may have opted in.
    send.mockResolvedValue({ messageId: 'SMdigest' });
    const nextDay = await digests.flush(new Date(NOW.getTime() + 24 * 60 * MINUTE));

    expect(nextDay).toEqual({ sent: 1, dropped: 0, waiting: 0 });
    expect(await waitingFor(OWNER)).toBe(0);
  });

  it('waits a quarter of an hour between attempts, and gives up on an alert after a week', () => {
    expect(SMS_DIGEST_RETRY_WAIT_MS).toBe(15 * MINUTE);
    expect(SMS_DIGEST_MAX_AGE_MS).toBe(7 * 24 * 60 * MINUTE);
    // Less than a day, so the next day's hour is never missed; more than the hour itself.
    expect(SMS_DIGEST_MIN_GAP_MS).toBe(20 * 60 * MINUTE);
  });

  it.each([
    [
      'the relay cannot be reached',
      new SmsNotSentError('relay_unreachable', 'unavailable'),
      'relay_unreachable',
    ],
    [
      'the relay limits the rate',
      new SmsNotSentError('rate_limited', 'rate_limited'),
      'rate_limited',
    ],
    [
      'the relay refuses the key',
      new SmsNotSentError('relay_http_403', 'refused'),
      'relay_http_403',
    ],
    [
      'something nobody expected goes wrong',
      new Error(`boom while texting ${OWNER_PHONE}`),
      'unexpected_error',
    ],
  ])('keeps the alerts and waits a quarter of an hour when %s', async (_why, failure, reason) => {
    await alertWaits(OWNER, OWNER_PHONE, 100);
    send.mockRejectedValue(failure);
    const digests = flusher();

    const first = await digests.flush(NOW);
    // The schedule calls every minute of the hour.
    for (let minute = 1; minute < 15; minute += 1) {
      await digests.flush(new Date(NOW.getTime() + minute * MINUTE));
    }

    expect(first).toEqual({ sent: 0, dropped: 0, waiting: 1 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(await waitingFor(OWNER)).toBe(1);
    // A failed attempt is not a text: nothing is written to the person's history.
    expect(await logRows()).toHaveLength(0);
    // Said once, not once a minute.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      { job: 'sms-digest', userId: OWNER, reason, alerts: 1 },
      'daily text summary not sent: it waits for the next attempt'
    );

    send.mockResolvedValue({ messageId: 'SMdigest' });
    const later = await digests.flush(new Date(NOW.getTime() + SMS_DIGEST_RETRY_WAIT_MS));

    expect(later).toEqual({ sent: 1, dropped: 0, waiting: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(await waitingFor(OWNER)).toBe(0);
  });

  it("one person's failure does not hold up the next person's summary", async () => {
    await alertWaits(OWNER, OWNER_PHONE, 100);
    await alertWaits(OTHER, OTHER_PHONE, 100);
    send.mockImplementation(async (phone: string) => {
      if (phone === OWNER_PHONE) throw new SmsNotSentError('relay_unreachable', 'unavailable');
      return { messageId: 'SMdigest' };
    });

    const tally = await flusher().flush(NOW);

    expect(tally).toEqual({ sent: 1, dropped: 0, waiting: 1 });
    expect(await waitingFor(OWNER)).toBe(1);
    expect(await waitingFor(OTHER)).toBe(0);
  });

  it('does not summarise alerts older than a week: they are dropped unsent', async () => {
    const weekAndABit = SMS_DIGEST_MAX_AGE_MS / MINUTE + 5;
    await alertWaits(OWNER, OWNER_PHONE, weekAndABit);
    await alertWaits(OWNER, OWNER_PHONE, 30);
    await alertWaits(OTHER, OTHER_PHONE, weekAndABit);

    const tally = await flusher().flush(NOW);

    // The owner hears about the one fresh alert; the other person has nothing fresh.
    expect(tally).toEqual({ sent: 1, dropped: 1, waiting: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![1]).toContain('1 new alert.');
    expect(await waitingFor(OWNER)).toBe(0);
    expect(await waitingFor(OTHER)).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      { job: 'sms-digest', userId: OTHER, alerts: 1 },
      'daily text summary dropped: the alerts waited more than a week'
    );
  });

  it('never writes a phone number or what went wrong in words to the log', async () => {
    await alertWaits(OWNER, OWNER_PHONE, 100);
    await alertWaits(OTHER, OTHER_PHONE, 100);
    send.mockImplementation(async (phone: string) => {
      if (phone === OWNER_PHONE) throw new SmsNotSentError('no_consent', 'recipient');
      throw new Error(`relay said: ${phone} is not reachable`);
    });

    await flusher().flush(NOW);

    const all = logged(info, warn, error);
    expect(all).not.toContain('5125550100');
    expect(all).not.toContain('5125550111');
    expect(all).not.toContain('relay said');
  });
});
