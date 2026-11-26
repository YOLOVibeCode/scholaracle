/**
 * Approving a device from the link the connector prints (issue #3).
 *
 * The page is opened by a fresh page load, outside the dashboard, so the API client has no
 * session in memory yet: the session is only in the browser's storage. Until 26 Nov 2026 the
 * page read the in-memory session, found none, and sent a signed-in parent to /login, which
 * forwards signed-in visitors to the dashboard. The device stayed "pending" forever.
 *
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConnectorActivatePage from './page';
import { apiClient } from '@/lib/api/client';
import { clearParentSessionAndRedirect } from '@/lib/auth/clearParentSession';

const push = jest.fn();
const searchParams = new Map<string, string>();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => searchParams.get(key) ?? null }),
}));
// Keep the real error class; only the page navigation is replaced (jsdom cannot navigate).
jest.mock('@/lib/auth/clearParentSession', () => ({
  ...jest.requireActual<typeof import('@/lib/auth/clearParentSession')>(
    '@/lib/auth/clearParentSession'
  ),
  clearParentSessionAndRedirect: jest.fn(),
}));

const STORED_SESSION = 'stored-session-for-this-test';
const RENEWED_SESSION = 'renewed-session-for-this-test';
const realFetch = globalThis.fetch;

interface IReply {
  readonly status: number;
  readonly body: unknown;
}
interface ICall {
  readonly url: string;
  readonly authorization: string | undefined;
  readonly body: unknown;
}

/** Stands in for the API. `answer` picks the reply from the path and how often it was called. */
function mockApi(answer: (path: string, nth: number) => IReply): ICall[] {
  const calls: ICall[] = [];
  const seen = new Map<string, number>();
  globalThis.fetch = jest.fn(
    async (url: string, init: { headers?: Record<string, string>; body?: string }) => {
      const path = new URL(url).pathname.replace(/^\/api/, '');
      const nth = (seen.get(path) ?? 0) + 1;
      seen.set(path, nth);
      calls.push({
        url,
        authorization: init.headers?.['Authorization'],
        body: init.body === undefined ? undefined : JSON.parse(init.body),
      });
      const reply = answer(path, nth);
      return {
        ok: reply.status >= 200 && reply.status < 300,
        status: reply.status,
        headers: { get: () => null },
        json: async () => reply.body,
      };
    }
  ) as unknown as typeof fetch;
  return calls;
}

const approveCalls = (calls: ICall[]): ICall[] =>
  calls.filter((call) => call.url.endsWith('/ingest/v1/device/approve'));

async function openAndApprove(): Promise<void> {
  render(<ConnectorActivatePage />);
  await waitFor(() => expect(screen.getByTestId('connector-user-code')).toHaveValue('ABCD-EFGH'));
  fireEvent.click(screen.getByTestId('connector-approve'));
}

describe('Activate connector page', () => {
  beforeEach(() => {
    push.mockClear();
    jest.mocked(clearParentSessionAndRedirect).mockClear();
    searchParams.clear();
    searchParams.set('code', 'abcd-efgh');
    localStorage.clear();
    sessionStorage.clear();
    // A fresh page load: nothing in memory.
    apiClient.setToken(null);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('fills in the code from the link, in capitals', async () => {
    render(<ConnectorActivatePage />);

    await waitFor(() => expect(screen.getByTestId('connector-user-code')).toHaveValue('ABCD-EFGH'));
  });

  it('approves with the session kept in the browser, on a fresh page load', async () => {
    localStorage.setItem('auth_token', STORED_SESSION);
    const calls = mockApi(() => ({ status: 200, body: { success: true } }));

    await openAndApprove();

    await waitFor(() => expect(screen.getByTestId('connector-success')).toBeInTheDocument());
    expect(approveCalls(calls)).toEqual([
      {
        url: expect.stringMatching(/\/ingest\/v1\/device\/approve$/),
        authorization: `Bearer ${STORED_SESSION}`,
        body: { userCode: 'ABCD-EFGH' },
      },
    ]);
    expect(push).not.toHaveBeenCalled();
  });

  it('renews a session that has run out, then approves', async () => {
    localStorage.setItem('auth_token', STORED_SESSION);
    const calls = mockApi((path, nth) => {
      if (path === '/auth/refresh') {
        return { status: 200, body: { success: true, token: RENEWED_SESSION } };
      }
      return nth === 1
        ? { status: 401, body: { error: 'Unauthorized' } }
        : { status: 200, body: { success: true } };
    });

    await openAndApprove();

    await waitFor(() => expect(screen.getByTestId('connector-success')).toBeInTheDocument());
    expect(approveCalls(calls).map((call) => call.authorization)).toEqual([
      `Bearer ${STORED_SESSION}`,
      `Bearer ${RENEWED_SESSION}`,
    ]);
    expect(clearParentSessionAndRedirect).not.toHaveBeenCalled();
  });

  it('sends a visitor with no session to sign in, and back here with the code', async () => {
    const calls = mockApi(() => ({ status: 200, body: { success: true } }));

    await openAndApprove();

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/login?redirect=${encodeURIComponent('/connector/activate?code=ABCD-EFGH')}`
      )
    );
    expect(calls).toEqual([]);
  });

  it('shows what the server said when the code is wrong or expired, and stays on the page', async () => {
    localStorage.setItem('auth_token', STORED_SESSION);
    mockApi(() => ({ status: 404, body: { error: 'User code not found or expired' } }));

    await openAndApprove();

    await waitFor(() =>
      expect(screen.getByTestId('connector-error')).toHaveTextContent(
        'User code not found or expired'
      )
    );
    expect(screen.queryByTestId('connector-success')).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('asks for a new sign-in, without an error box, when the session cannot be renewed', async () => {
    localStorage.setItem('auth_token', STORED_SESSION);
    mockApi(() => ({ status: 401, body: { error: 'Unauthorized' } }));

    await openAndApprove();

    await waitFor(() =>
      expect(clearParentSessionAndRedirect).toHaveBeenCalledWith('session_expired')
    );
    expect(screen.queryByTestId('connector-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('connector-success')).not.toBeInTheDocument();
  });
});
