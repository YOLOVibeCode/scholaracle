/**
 * SOURCE_INVITE.md §4.3 / §5.4
 */

import { ObjectId } from 'mongodb';
import {
  SOURCE_INVITE_ADAPTER_IDS,
  SOURCE_INVITE_REDEEM_ERROR,
  SOURCE_INVITE_TOKEN_BYTES,
  SOURCE_INVITE_TTL_MS,
  assertNoSecrets,
} from '@scholaracle/contracts';
import type { ISourceInviteRecord, ISourceInviteStore } from '@scholaracle/database';
import { FakeClock } from './clock';
import { SourceInviteService } from './SourceInviteService';
import type { IOwnedStudent, IStudentOwnerLookup } from './studentOwnerLookup';
import { FixedTokenGenerator, Sha256TokenHasher } from './tokens';

const AVA_TOKEN = 'ab'.repeat(32);
const USER_A = new ObjectId().toString();
const USER_B = new ObjectId().toString();
const STUDENT_ID = new ObjectId().toString();

class MemorySourceInviteStore implements ISourceInviteStore {
  readonly rows: ISourceInviteRecord[] = [];

  async insert(record: Omit<ISourceInviteRecord, 'id'>): Promise<ISourceInviteRecord> {
    const saved: ISourceInviteRecord = { ...record, id: `id-${this.rows.length + 1}` };
    this.rows.push(saved);
    return saved;
  }

  async findByHash(tokenHash: string): Promise<ISourceInviteRecord | null> {
    return this.rows.find((r) => r.tokenHash === tokenHash) ?? null;
  }

  async consumeIfOpen(id: string, now: Date): Promise<boolean> {
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.consumedAt !== null || row.expiresAt.getTime() <= now.getTime()) return false;
    const idx = this.rows.indexOf(row);
    this.rows[idx] = { ...row, consumedAt: now };
    return true;
  }

  async invalidateOpen(params: {
    readonly userId: string;
    readonly studentId: string;
    readonly provider: string;
    readonly institutionExternalId: string;
    readonly now: Date;
  }): Promise<number> {
    let n = 0;
    for (let i = 0; i < this.rows.length; i += 1) {
      const row = this.rows[i];
      if (!row || row.consumedAt !== null) continue;
      if (
        row.userId === params.userId &&
        row.payload.studentId === params.studentId &&
        row.payload.provider === params.provider &&
        row.payload.institutionExternalId === params.institutionExternalId
      ) {
        this.rows[i] = { ...row, consumedAt: params.now };
        n += 1;
      }
    }
    return n;
  }
}

class FakeStudents implements IStudentOwnerLookup {
  constructor(private readonly owned: IOwnedStudent | null) {}

  async findOwnedStudent(_userId: string, studentId: string): Promise<IOwnedStudent | null> {
    if (!this.owned) return null;
    return this.owned.id === studentId ? this.owned : null;
  }
}

function makeService(
  store: MemorySourceInviteStore,
  clock: FakeClock,
  students: IStudentOwnerLookup = new FakeStudents({
    id: STUDENT_ID,
    name: 'Ava Lewis',
    studentExternalId: 'ava-lewis',
  })
): SourceInviteService {
  return new SourceInviteService(
    store,
    clock,
    new FixedTokenGenerator(AVA_TOKEN),
    new Sha256TokenHasher(),
    students
  );
}

describe('SourceInviteService', () => {
  const hasher = new Sha256TokenHasher();

  it('issue then redeem same user returns Ava payload', async () => {
    const store = new MemorySourceInviteStore();
    const clock = new FakeClock(new Date('2026-08-15T00:00:00.000Z'));
    const service = makeService(store, clock);
    const issued = await service.issue({
      userId: USER_A,
      request: {
        studentId: STUDENT_ID,
        provider: 'skyward',
        portalBaseUrl: 'https://skyward.iscorp.com/',
      },
    });
    expect(issued.token).toBe(AVA_TOKEN);
    expect(issued.payload.portalBaseUrl).toBe('https://skyward.iscorp.com');
    expect(issued.payload.adapterId).toBe(SOURCE_INVITE_ADAPTER_IDS.skyward);
    expect(issued.payload.studentExternalId).toBe('ava-lewis');
    expect(issued.expiresAt.getTime() - clock.now().getTime()).toBe(SOURCE_INVITE_TTL_MS);

    const payload = await service.redeem({ userId: USER_A, token: AVA_TOKEN });
    expect(payload).toEqual(issued.payload);
  });

  it('second redeem fails with typed not-found', async () => {
    const store = new MemorySourceInviteStore();
    const clock = new FakeClock(new Date('2026-08-15T00:00:00.000Z'));
    const service = makeService(store, clock);
    await service.issue({
      userId: USER_A,
      request: {
        studentId: STUDENT_ID,
        provider: 'skyward',
        portalBaseUrl: 'https://skyward.iscorp.com',
      },
    });
    await service.redeem({ userId: USER_A, token: AVA_TOKEN });
    await expect(service.redeem({ userId: USER_A, token: AVA_TOKEN })).rejects.toThrow(
      SOURCE_INVITE_REDEEM_ERROR
    );
  });

  it('wrong userId fails with the same not-found message', async () => {
    const store = new MemorySourceInviteStore();
    const clock = new FakeClock(new Date('2026-08-15T00:00:00.000Z'));
    const service = makeService(store, clock);
    await service.issue({
      userId: USER_A,
      request: {
        studentId: STUDENT_ID,
        provider: 'skyward',
        portalBaseUrl: 'https://skyward.iscorp.com',
      },
    });
    await expect(service.redeem({ userId: USER_B, token: AVA_TOKEN })).rejects.toThrow(
      SOURCE_INVITE_REDEEM_ERROR
    );
  });

  it('FakeClock + 8 days → redeem fails', async () => {
    const store = new MemorySourceInviteStore();
    const clock = new FakeClock(new Date('2026-08-15T00:00:00.000Z'));
    const service = makeService(store, clock);
    await service.issue({
      userId: USER_A,
      request: {
        studentId: STUDENT_ID,
        provider: 'skyward',
        portalBaseUrl: 'https://skyward.iscorp.com',
      },
    });
    clock.advance(8 * 24 * 60 * 60 * 1000);
    await expect(service.redeem({ userId: USER_A, token: AVA_TOKEN })).rejects.toThrow(
      SOURCE_INVITE_REDEEM_ERROR
    );
  });

  it('re-issue invalidates previous token', async () => {
    const store = new MemorySourceInviteStore();
    const clock = new FakeClock(new Date('2026-08-15T00:00:00.000Z'));
    const first = new SourceInviteService(
      store,
      clock,
      new FixedTokenGenerator('aa'.repeat(32)),
      hasher,
      new FakeStudents({ id: STUDENT_ID, name: 'Ava Lewis', studentExternalId: 'ava-lewis' })
    );
    await first.issue({
      userId: USER_A,
      request: {
        studentId: STUDENT_ID,
        provider: 'skyward',
        portalBaseUrl: 'https://skyward.iscorp.com',
      },
    });
    const second = new SourceInviteService(
      store,
      clock,
      new FixedTokenGenerator('bb'.repeat(32)),
      hasher,
      new FakeStudents({ id: STUDENT_ID, name: 'Ava Lewis', studentExternalId: 'ava-lewis' })
    );
    await second.issue({
      userId: USER_A,
      request: {
        studentId: STUDENT_ID,
        provider: 'skyward',
        portalBaseUrl: 'https://skyward.iscorp.com',
      },
    });
    await expect(first.redeem({ userId: USER_A, token: 'aa'.repeat(32) })).rejects.toThrow(
      SOURCE_INVITE_REDEEM_ERROR
    );
    await expect(second.redeem({ userId: USER_A, token: 'bb'.repeat(32) })).resolves.toMatchObject({
      provider: 'skyward',
    });
  });

  it('issue for other user’s studentId → not found', async () => {
    const store = new MemorySourceInviteStore();
    const clock = new FakeClock(new Date('2026-08-15T00:00:00.000Z'));
    const service = makeService(store, clock, new FakeStudents(null));
    await expect(
      service.issue({
        userId: USER_A,
        request: {
          studentId: STUDENT_ID,
          provider: 'skyward',
          portalBaseUrl: 'https://skyward.iscorp.com',
        },
      })
    ).rejects.toThrow(/not found/i);
  });

  it('stored record JSON assertNoSecrets on payload; hash equals hasher.hash(raw)', async () => {
    const store = new MemorySourceInviteStore();
    const clock = new FakeClock(new Date('2026-08-15T00:00:00.000Z'));
    const service = makeService(store, clock);
    await service.issue({
      userId: USER_A,
      request: {
        studentId: STUDENT_ID,
        provider: 'skyward',
        portalBaseUrl: 'https://skyward.iscorp.com',
      },
    });
    const row = store.rows[0];
    expect(row).toBeDefined();
    expect(row?.tokenHash).toBe(hasher.hash(AVA_TOKEN));
    expect(() => assertNoSecrets(row?.payload)).not.toThrow();
    expect(JSON.stringify(row)).not.toContain('"token":');
  });

  it('ITokenGenerator is used with 32 bytes', async () => {
    const store = new MemorySourceInviteStore();
    const clock = new FakeClock(new Date('2026-08-15T00:00:00.000Z'));
    let nbytesSeen = 0;
    const service = new SourceInviteService(
      store,
      clock,
      {
        randomHex(nbytes: number): string {
          nbytesSeen = nbytes;
          return AVA_TOKEN;
        },
      },
      hasher,
      new FakeStudents({ id: STUDENT_ID, name: 'Ava', studentExternalId: 'ava-lewis' })
    );
    await service.issue({
      userId: USER_A,
      request: {
        studentId: STUDENT_ID,
        provider: 'skyward',
        portalBaseUrl: 'https://skyward.iscorp.com',
      },
    });
    expect(nbytesSeen).toBe(SOURCE_INVITE_TOKEN_BYTES);
  });

  it('redeem of short token fails closed', async () => {
    const store = new MemorySourceInviteStore();
    const clock = new FakeClock(new Date('2026-08-15T00:00:00.000Z'));
    const service = makeService(store, clock);
    await expect(service.redeem({ userId: USER_A, token: 'short' })).rejects.toThrow(
      SOURCE_INVITE_REDEEM_ERROR
    );
  });
});
