import { setErrorReporter, NoopErrorReporter, type IErrorReporter } from '@scholaracle/contracts';
import { safeInterval } from './safeInterval';
import { logger } from '../logger';

describe('safeInterval', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    setErrorReporter(new NoopErrorReporter());
  });

  it('should keep ticking after a failure and log it', async () => {
    // Arrange
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    let calls = 0;
    const fn = jest.fn(async (): Promise<void> => {
      calls++;
      if (calls === 1) throw new Error('tick failed');
    });

    // Act
    const handle = safeInterval('test-job', fn, 1000);
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(1000);
    clearInterval(handle);

    // Assert
    expect(fn).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'test-job' }),
      'scheduled job failed'
    );
  });

  it('should report failures to the error reporter', async () => {
    // Arrange
    jest.spyOn(logger, 'error').mockImplementation(() => logger);
    const captured: unknown[] = [];
    const reporter: IErrorReporter = {
      captureException: (error): void => {
        captured.push(error);
      },
      captureMessage: (): void => {
        // not used
      },
    };
    setErrorReporter(reporter);

    // Act
    const handle = safeInterval('test-job', () => Promise.reject(new Error('boom')), 1000);
    await jest.advanceTimersByTimeAsync(1000);
    clearInterval(handle);

    // Assert
    expect(captured).toHaveLength(1);
  });

  it('should not report when isReported is false', async () => {
    // Arrange
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const captured: unknown[] = [];
    setErrorReporter({
      captureException: (error): void => {
        captured.push(error);
      },
      captureMessage: (): void => {
        // not used
      },
    });

    // Act
    const handle = safeInterval('best-effort', () => Promise.reject(new Error('meh')), 1000, {
      level: 'warn',
      isReported: false,
    });
    await jest.advanceTimersByTimeAsync(1000);
    clearInterval(handle);

    // Assert
    expect(captured).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'best-effort' }),
      'scheduled job failed'
    );
  });

  it('should skip a tick while the previous run is still in progress', async () => {
    // Arrange
    jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    let resolveFirst: () => void = () => undefined;
    let calls = 0;
    const fn = jest.fn((): Promise<void> => {
      calls++;
      if (calls === 1) {
        return new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve();
    });

    // Act: first tick starts a run that never finishes before the second tick
    const handle = safeInterval('slow-job', fn, 1000);
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(1);

    // Let the first run finish; next tick runs again
    resolveFirst();
    await jest.advanceTimersByTimeAsync(1000);
    clearInterval(handle);

    // Assert
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
