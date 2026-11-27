import type { IEmailDigestPendingItem } from '@scholaracle/database';
import { logger } from '../logger';
import { DigestInsightService } from './digest-insight-service';
import { GlanceInsightService } from './glance-insight-service';
import { LlmClient, LlmHttpError } from './llm-client';

/**
 * The digest and the daily snapshot ask the model for a short insight. When the call
 * fails the email goes out without it. These tests pin that the log says which way it
 * went, and that the line carries nothing about the family and nothing the relay replied.
 */

const originalFetch = globalThis.fetch;

const STUDENT = 'Avery Quillfeather';
const ASSIGNMENT = 'Photosynthesis lab report';
const ANSWER = 'Start with the lab report tonight; the math grade is climbing.';
/** A relay's refusal can quote part of the key it was sent. */
const RELAY_REFUSAL =
  'Authentication Error, Invalid proxy server token passed. Received API Key = sk-...Zq9X';

function relayAnswers(status: number, body: unknown): jest.Mock {
  const fake = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    json: () => Promise.resolve(body),
  });
  globalThis.fetch = fake as unknown as typeof fetch;
  return fake;
}

function relayCannotBeReached(code?: string): void {
  const cause = Object.assign(new Error(`connect to ${STUDENT}'s relay timed out`), { code });
  const failure = Object.assign(new TypeError('fetch failed'), { cause });
  globalThis.fetch = jest.fn().mockRejectedValue(failure) as unknown as typeof fetch;
}

function completion(text: string): unknown {
  return { content: [{ type: 'text', text }], usage: { input_tokens: 40, output_tokens: 20 } };
}

function client(): LlmClient {
  return new LlmClient({ apiKey: 'test-key', model: 'test-model', baseUrl: 'https://relay.test' });
}

const DIGEST_ITEM: IEmailDigestPendingItem = {
  userId: 'user-1',
  recipientEmail: 'parent@example.test',
  alertType: 'missing_assignment',
  severity: 'warning',
  subject: `Missing: ${ASSIGNMENT}`,
  body: `${STUDENT} has not handed in ${ASSIGNMENT}.`,
  studentName: STUDENT,
  courseName: 'Biology',
  assignmentTitle: ASSIGNMENT,
  createdAt: new Date('2026-11-27T15:00:00.000Z'),
};

const SERVICES = [
  {
    job: 'digest-insight',
    ask: (): Promise<string | undefined> =>
      new DigestInsightService({ llmClient: client() }).generateInsight([DIGEST_ITEM], STUDENT),
  },
  {
    job: 'glance-insight',
    ask: (): Promise<string | undefined> =>
      new GlanceInsightService({ llmClient: client() }).generateInsight({
        studentName: STUDENT,
        gradeCount: 4,
        lowestGradePercent: 71,
        lowestGradeCourse: 'Biology',
        missingCount: 1,
        upcomingCount: 2,
        missingTitles: [ASSIGNMENT],
      }),
  },
] as const;

describe.each(SERVICES)('the log says how the $job call ended', ({ job, ask }) => {
  let info: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  /** Everything that reached the log, as one string, to search for what must not be there. */
  function everythingLogged(): string {
    return JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
  }

  it('an insight that was written: one line with its length', async () => {
    relayAnswers(200, completion(`  ${ANSWER}  `));

    await expect(ask()).resolves.toBe(ANSWER);

    expect(info.mock.calls).toEqual([[{ job, chars: ANSWER.length }, 'AI insight written']]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('the line for a written insight names nobody and quotes nothing', async () => {
    relayAnswers(200, completion(ANSWER));

    await ask();

    const logged = everythingLogged();
    expect(logged).not.toContain(STUDENT);
    expect(logged).not.toContain(ASSIGNMENT);
    expect(logged).not.toContain(ANSWER);
  });

  it('a refusal by the relay: the status, and nothing of what the relay replied', async () => {
    relayAnswers(401, RELAY_REFUSAL);

    await expect(ask()).resolves.toBeUndefined();

    expect(warn.mock.calls).toEqual([[{ job, reason: 'http 401' }, 'AI insight not written']]);
    expect(info).not.toHaveBeenCalled();
    const logged = everythingLogged();
    expect(logged).not.toContain('sk-');
    expect(logged).not.toContain('Zq9X');
    expect(logged).not.toContain('Authentication');
  });

  it.each([400, 404, 429, 500, 503])('status %i is reported as that status', async (status) => {
    relayAnswers(status, { error: { message: `no such model for ${STUDENT}` } });

    await expect(ask()).resolves.toBeUndefined();

    expect(warn.mock.calls).toEqual([
      [{ job, reason: `http ${status}` }, 'AI insight not written'],
    ]);
    expect(everythingLogged()).not.toContain(STUDENT);
  });

  it('a spent budget is named as that', async () => {
    relayAnswers(402, { error: 'payment required' });

    await expect(ask()).resolves.toBeUndefined();

    expect(warn.mock.calls).toEqual([
      [{ job, reason: 'budget exceeded' }, 'AI insight not written'],
    ]);
  });

  it('a relay that cannot be reached: the network code, and not the message', async () => {
    relayCannotBeReached('UND_ERR_CONNECT_TIMEOUT');

    await expect(ask()).resolves.toBeUndefined();

    expect(warn.mock.calls).toEqual([
      [{ job, reason: 'network UND_ERR_CONNECT_TIMEOUT' }, 'AI insight not written'],
    ]);
    expect(everythingLogged()).not.toContain(STUDENT);
  });

  it('a network failure with no usable code is still reported as the network', async () => {
    relayCannotBeReached(`code for ${STUDENT}`);

    await expect(ask()).resolves.toBeUndefined();

    expect(warn.mock.calls).toEqual([[{ job, reason: 'network' }, 'AI insight not written']]);
    expect(everythingLogged()).not.toContain(STUDENT);
  });

  it('an empty answer is reported, and no insight is returned', async () => {
    relayAnswers(200, completion('   '));

    await expect(ask()).resolves.toBeUndefined();

    expect(warn.mock.calls).toEqual([[{ job, reason: 'empty answer' }, 'AI insight not written']]);
    expect(info).not.toHaveBeenCalled();
  });

  it('a reply that is not what the model sends is reported without its text', async () => {
    relayAnswers(200, { unexpected: `shape for ${STUDENT}` });

    await expect(ask()).resolves.toBeUndefined();

    expect(warn.mock.calls).toEqual([[{ job, reason: 'unknown error' }, 'AI insight not written']]);
    expect(everythingLogged()).not.toContain(STUDENT);
  });
});

describe('a digest with nothing in it', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('asks the model nothing and logs nothing', async () => {
    const fake = relayAnswers(200, completion(ANSWER));
    const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

    const insight = await new DigestInsightService({ llmClient: client() }).generateInsight([]);

    expect(insight).toBeUndefined();
    expect(fake).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('LlmClient on an error status', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('throws an error that carries the status, with the message callers already match', async () => {
    relayAnswers(503, 'upstream unavailable');

    const failure = await client()
      .complete([{ role: 'user', content: 'hello' }])
      .catch((err: unknown) => err);

    expect(failure).toBeInstanceOf(LlmHttpError);
    expect((failure as LlmHttpError).status).toBe(503);
    expect((failure as LlmHttpError).message).toBe('LLM API error 503: upstream unavailable');
  });
});
