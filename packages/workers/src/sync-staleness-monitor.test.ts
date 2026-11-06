import { isDataSourceStale } from './sync-staleness-monitor';

describe('sync staleness (lastSuccessAt)', () => {
  it('treats a source with lastSuccessAt within the 48h window as fresh', () => {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - 48 * 60 * 60_000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60_000);
    const isStale = isDataSourceStale({ lastSuccessAt: oneHourAgo }, staleThreshold);
    expect(isStale).toBe(false);
  });

  it('treats missing lastSuccessAt as stale', () => {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - 48 * 60 * 60_000);
    expect(isDataSourceStale({}, staleThreshold)).toBe(true);
  });
});
