import { createLogger } from './logger';
import { runWithRequestId, getRequestId } from './requestContext';
import { isProductionEnv, isTestEnv, isDevelopmentEnv, getNodeEnv } from './env';

interface ICapturedLine {
  level: number;
  name?: string;
  msg?: string;
  requestId?: string;
  err?: { type?: string; message?: string; stack?: string };
  [key: string]: unknown;
}

function makeCapture(): { lines: ICapturedLine[]; stream: { write(chunk: string): void } } {
  const lines: ICapturedLine[] = [];
  return {
    lines,
    stream: {
      write(chunk: string): void {
        lines.push(JSON.parse(chunk) as ICapturedLine);
      },
    },
  };
}

describe('createLogger', () => {
  it('should emit one-line JSON with name and message', () => {
    // Arrange
    const { lines, stream } = makeCapture();
    const logger = createLogger('api', { level: 'info', destination: stream });

    // Act
    logger.info({ method: 'GET', path: '/api/students' }, 'request completed');

    // Assert
    expect(lines).toHaveLength(1);
    expect(lines[0]?.name).toBe('api');
    expect(lines[0]?.msg).toBe('request completed');
    expect(lines[0]?.['method']).toBe('GET');
  });

  it('should serialize errors with type, message, and stack', () => {
    // Arrange
    const { lines, stream } = makeCapture();
    const logger = createLogger('api', { level: 'error', destination: stream });

    // Act
    logger.error({ err: new TypeError('boom') }, 'request failed');

    // Assert
    expect(lines[0]?.err?.type).toBe('TypeError');
    expect(lines[0]?.err?.message).toBe('boom');
    expect(lines[0]?.err?.stack).toContain('TypeError: boom');
  });

  it('should attach requestId from the async context via mixin', () => {
    // Arrange
    const { lines, stream } = makeCapture();
    const logger = createLogger('api', { level: 'info', destination: stream });

    // Act
    runWithRequestId('req-123', () => {
      logger.info('inside context');
    });
    logger.info('outside context');

    // Assert
    expect(lines[0]?.requestId).toBe('req-123');
    expect(lines[1]?.requestId).toBeUndefined();
  });

  it('should redact sensitive fields', () => {
    // Arrange
    const { lines, stream } = makeCapture();
    const logger = createLogger('api', { level: 'info', destination: stream });

    // Act
    logger.info({ user: { password: 'hunter2', token: 'abc' } }, 'login attempt');

    // Assert
    const user = lines[0]?.['user'] as Record<string, unknown>;
    expect(user['password']).toBe('[redacted]');
    expect(user['token']).toBe('[redacted]');
  });

  it('should default to silent level under NODE_ENV=test', () => {
    // Arrange
    const { lines, stream } = makeCapture();
    const logger = createLogger('api', { destination: stream });

    // Act
    logger.info('should not appear');

    // Assert
    expect(logger.level).toBe('silent');
    expect(lines).toHaveLength(0);
  });
});

describe('requestContext', () => {
  it('should return undefined outside a context', () => {
    expect(getRequestId()).toBeUndefined();
  });

  it('should propagate through async boundaries', async () => {
    // Act
    const observed = await runWithRequestId('req-async', async () => {
      await Promise.resolve();
      return getRequestId();
    });

    // Assert
    expect(observed).toBe('req-async');
  });

  it('should isolate nested contexts', () => {
    // Act & Assert
    runWithRequestId('outer', () => {
      expect(getRequestId()).toBe('outer');
      runWithRequestId('inner', () => {
        expect(getRequestId()).toBe('inner');
      });
      expect(getRequestId()).toBe('outer');
    });
  });
});

describe('env helpers', () => {
  it('should report test env under jest', () => {
    expect(getNodeEnv()).toBe('test');
    expect(isTestEnv()).toBe(true);
    expect(isProductionEnv()).toBe(false);
    expect(isDevelopmentEnv()).toBe(false);
  });
});
