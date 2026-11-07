import type { IScraperHost } from '../registry/module';

export async function runPortalStep<T>(
  host: IScraperHost,
  step: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    await host.captureSkeletonOnFailure?.(step).catch(() => undefined);
    throw err;
  }
}
