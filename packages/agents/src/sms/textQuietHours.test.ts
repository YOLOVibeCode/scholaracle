/**
 * When a person may be texted: not in their quiet hours, unless the alert is critical and
 * they left that exception on. The lookup is run against a real (in-memory) database.
 */

import { MongoClient, ObjectId, type Db } from 'mongodb';
import { createTextNotBeforeLookup, textNotBefore } from './textQuietHours';

/** 2:30 in the morning in Chicago (UTC-6 in November). */
const NIGHT = new Date('2026-11-28T08:30:00Z');
/** 3 in the afternoon in Chicago. */
const AFTERNOON = new Date('2026-11-27T21:00:00Z');
/** 7 in the morning in Chicago, the day of `NIGHT`. */
const SEVEN_CHICAGO = new Date('2026-11-28T13:00:00Z');

/** An account as it is stored. `timezone: null` is an account that has none. */
function account(
  quietHours?: Record<string, unknown>,
  timezone: string | null = 'America/Chicago'
): Parameters<typeof textNotBefore>[0] {
  return {
    ...(timezone !== null ? { timezone } : {}),
    preferences: { notifications: quietHours !== undefined ? { quietHours } : {} },
  };
}

const TEN_TO_SEVEN = { enabled: true, start: '22:00', end: '07:00', criticalOverride: true };

describe('textNotBefore', () => {
  it('holds a text in the quiet hours of the person until they end, on their own clock', () => {
    expect(textNotBefore(account(TEN_TO_SEVEN), 'warning', NIGHT)).toEqual(SEVEN_CHICAGO);
    // The same moment is 3:30 am in New York: their quiet hours end an hour earlier.
    expect(textNotBefore(account(TEN_TO_SEVEN, 'America/New_York'), 'warning', NIGHT)).toEqual(
      new Date('2026-11-28T12:00:00Z')
    );
  });

  it('lets a text go outside quiet hours', () => {
    expect(textNotBefore(account(TEN_TO_SEVEN), 'warning', AFTERNOON)).toBeNull();
  });

  it('lets a text go at any hour when the person turned quiet hours off', () => {
    expect(
      textNotBefore(account({ ...TEN_TO_SEVEN, enabled: false }), 'warning', NIGHT)
    ).toBeNull();
  });

  it('lets a critical alert through quiet hours, and only a critical one', () => {
    expect(textNotBefore(account(TEN_TO_SEVEN), 'critical', NIGHT)).toBeNull();
    expect(textNotBefore(account(TEN_TO_SEVEN), 'info', NIGHT)).toEqual(SEVEN_CHICAGO);
  });

  it('holds a critical alert too when the person turned that exception off', () => {
    const noException = { ...TEN_TO_SEVEN, criticalOverride: false };

    expect(textNotBefore(account(noException), 'critical', NIGHT)).toEqual(SEVEN_CHICAGO);
  });

  it('uses the hours the person chose', () => {
    const early = { enabled: true, start: '20:00', end: '05:30', criticalOverride: true };

    expect(textNotBefore(account(early), 'warning', NIGHT)).toEqual(
      new Date('2026-11-28T11:30:00Z')
    );
    // 9 pm in Chicago: quiet for this person, not yet for one on 22:00.
    const ninePm = new Date('2026-11-28T03:00:00Z');
    expect(textNotBefore(account(early), 'warning', ninePm)).toEqual(
      new Date('2026-11-28T11:30:00Z')
    );
    expect(textNotBefore(account(TEN_TO_SEVEN), 'warning', ninePm)).toBeNull();
  });

  it('gives an account that never saved quiet hours the ones Settings shows: on, 22:00 to 07:00, critical alerts through', () => {
    expect(textNotBefore(account(), 'warning', NIGHT)).toEqual(SEVEN_CHICAGO);
    expect(textNotBefore(account(), 'warning', AFTERNOON)).toBeNull();
    expect(textNotBefore(account(), 'critical', NIGHT)).toBeNull();
    expect(textNotBefore({}, 'warning', NIGHT)).toEqual(new Date('2026-11-28T12:00:00Z'));
    // The edges, in Chicago: 9:59 pm is not quiet yet, 10:00 pm is; 6:59 am still is, 7:00 am is not.
    expect(textNotBefore(account(), 'warning', new Date('2026-11-28T03:59:00Z'))).toBeNull();
    expect(textNotBefore(account(), 'warning', new Date('2026-11-28T04:00:00Z'))).toEqual(
      SEVEN_CHICAGO
    );
    expect(textNotBefore(account(), 'warning', new Date('2026-11-28T12:59:00Z'))).toEqual(
      SEVEN_CHICAGO
    );
    expect(textNotBefore(account(), 'warning', SEVEN_CHICAGO)).toBeNull();
  });

  it('reads an account without a time zone on the clock of New York, as the account model does', () => {
    expect(textNotBefore(account(TEN_TO_SEVEN, null), 'warning', NIGHT)).toEqual(
      new Date('2026-11-28T12:00:00Z')
    );
  });

  it('holds a text for an account it cannot read, by the same hours', () => {
    expect(textNotBefore(null, 'warning', NIGHT)).toEqual(new Date('2026-11-28T12:00:00Z'));
    expect(textNotBefore(null, 'warning', AFTERNOON)).toBeNull();
  });
});

describe('createTextNotBeforeLookup', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017');
    await client.connect();
    db = client.db(`text_quiet_hours_${process.pid}`);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  beforeEach(async () => {
    await db.collection('users').deleteMany({});
  });

  async function person(quietHours: Record<string, unknown>, timezone: string): Promise<string> {
    const id = new ObjectId();
    await db.collection('users').insertOne({
      _id: id,
      email: `${id.toString()}@example.com`,
      passwordHash: 'x',
      name: 'A Parent',
      timezone,
      preferences: { notifications: { push: true, email: true, sms: true, quietHours } },
    });
    return id.toString();
  }

  it('reads the quiet hours and the time zone of the account it is asked about', async () => {
    const chicago = await person(TEN_TO_SEVEN, 'America/Chicago');
    const denver = await person(
      { enabled: true, start: '21:00', end: '06:30', criticalOverride: false },
      'America/Denver'
    );
    const lookup = createTextNotBeforeLookup(db, () => NIGHT);

    expect(await lookup(chicago, 'warning')).toEqual(SEVEN_CHICAGO);
    expect(await lookup(chicago, 'critical')).toBeNull();
    // 1:30 am in Denver; this person's quiet hours end at 6:30, and hold critical alerts too.
    expect(await lookup(denver, 'critical')).toEqual(new Date('2026-11-28T13:30:00Z'));
  });

  it('asks the clock each time it is called', async () => {
    const chicago = await person(TEN_TO_SEVEN, 'America/Chicago');
    let now = NIGHT;
    const lookup = createTextNotBeforeLookup(db, () => now);

    expect(await lookup(chicago, 'warning')).toEqual(SEVEN_CHICAGO);
    now = AFTERNOON;
    expect(await lookup(chicago, 'warning')).toBeNull();
  });

  it('goes by the time it is asked at when it is given no clock', async () => {
    const hour = 60 * 60 * 1000;
    /** `HH:mm` on the UTC clock, `hours` from now. */
    const utcClock = (hours: number): string =>
      new Date(Date.now() + hours * hour).toISOString().slice(11, 16);
    const quietNow = await person(
      { enabled: true, start: utcClock(-1), end: utcClock(2), criticalOverride: true },
      'UTC'
    );
    const quietLater = await person(
      { enabled: true, start: utcClock(2), end: utcClock(3), criticalOverride: true },
      'UTC'
    );
    const lookup = createTextNotBeforeLookup(db);

    const until = await lookup(quietNow, 'warning');

    expect(until?.getTime()).toBeGreaterThan(Date.now() + hour);
    expect(until?.getTime()).toBeLessThanOrEqual(Date.now() + 2 * hour);
    expect(await lookup(quietLater, 'warning')).toBeNull();
  });

  it('holds by the usual hours for an id that is no account', async () => {
    const lookup = createTextNotBeforeLookup(db, () => NIGHT);

    expect(await lookup('not-an-id', 'warning')).toEqual(new Date('2026-11-28T12:00:00Z'));
    expect(await lookup(new ObjectId().toString(), 'warning')).toEqual(
      new Date('2026-11-28T12:00:00Z')
    );
  });
});
