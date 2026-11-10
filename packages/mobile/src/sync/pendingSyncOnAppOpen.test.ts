import { fetchPendingSyncRequestsOnAppOpen } from './pendingSyncOnAppOpen';

describe('fetchPendingSyncRequestsOnAppOpen', () => {
  it('fetches pending sync requests on app open', async () => {
    const fetcher = jest.fn().mockResolvedValue([
      {
        syncRequestId: 'req-1',
        studentId: 'stu-1',
        sourceId: 'src-1',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const pending = await fetchPendingSyncRequestsOnAppOpen(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.syncRequestId).toBe('req-1');
  });
});
