import { FakePageDriver } from '../driver/FakePageDriver';
import type { IScraperHost } from '../registry/module';
import { runPortalStep } from './runPortalStep';

function makeHost(capture: jest.Mock): IScraperHost {
  return {
    driver: new FakePageDriver(),
    config: { baseUrl: 'https://school.example.edu' },
    progress: () => undefined,
    captureSkeletonOnFailure: capture,
  };
}

describe('runPortalStep', () => {
  it('captures skeleton only when the step fails', async () => {
    const capture = jest.fn(async () => undefined);
    const host = makeHost(capture);

    await expect(
      runPortalStep(host, 'canvas.extract', async () => {
        throw new Error('portal timed out');
      })
    ).rejects.toThrow('portal timed out');
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('canvas.extract');

    const value = await runPortalStep(host, 'canvas.extract', async () => 'ok');
    expect(value).toBe('ok');
    expect(capture).toHaveBeenCalledTimes(1);
  });
});
