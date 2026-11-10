jest.mock('@scholaracle/contracts', () => ({
  getErrorReporter: () => ({ captureException: jest.fn() }),
}));

import { installProcessHandlers } from './processHandlers';

describe('installProcessHandlers', () => {
  it('logs unhandled rejections without exiting', () => {
    const logger = {
      error: jest.fn(),
      fatal: jest.fn(),
    };
    installProcessHandlers(logger as never);
    process.emit('unhandledRejection', new Error('boom'), Promise.resolve());
    expect(logger.error).toHaveBeenCalled();
  });

  it('logs and exits on uncaught exceptions', () => {
    const logger = {
      error: jest.fn(),
      fatal: jest.fn(),
    };
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    installProcessHandlers(logger as never);
    process.emit('uncaughtException', new Error('fatal'));
    expect(logger.fatal).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});
