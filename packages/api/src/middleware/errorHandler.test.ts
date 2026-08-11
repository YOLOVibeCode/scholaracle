import express, { type Express } from 'express';
import request from 'supertest';
import {
  NotFoundError,
  ValidationError,
  setErrorReporter,
  NoopErrorReporter,
  type IErrorReporter,
} from '@scholaracle/contracts';
import { createLogger } from '@scholaracle/logger';
import { createErrorHandler, notFoundHandler } from './errorHandler';
import { requestIdMiddleware } from './requestId';
import { asyncHandler } from './asyncHandler';

function buildApp(isProduction: boolean): Express {
  const app = express();
  app.use(requestIdMiddleware);

  app.get('/throws-app-error', () => {
    throw new NotFoundError('Student not found');
  });

  app.get(
    '/throws-async',
    asyncHandler(() => Promise.reject(new TypeError('async boom')))
  );

  app.get('/throws-validation', () => {
    throw ValidationError.fromZod({ issues: [{ path: ['email'], message: 'Invalid email' }] });
  });

  app.use(notFoundHandler);
  app.use(createErrorHandler({ isProduction, logger: createLogger('test', { level: 'silent' }) }));
  return app;
}

describe('error handling middleware (integration)', () => {
  afterEach(() => {
    setErrorReporter(new NoopErrorReporter());
  });

  describe('in development/test mode', () => {
    const app = buildApp(false);

    it('should return operational errors with debug info and x-request-id', async () => {
      // Act
      const response = await request(app).get('/throws-app-error');

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Student not found');
      expect(response.body.code).toBe('NOT_FOUND');
      expect(response.body.requestId).toBeDefined();
      expect(response.headers['x-request-id']).toBe(response.body.requestId);
      expect(response.body.debug.name).toBe('NotFoundError');
    });

    it('should trap rejected async handlers and expose the real message', async () => {
      // Act
      const response = await request(app).get('/throws-async');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('async boom');
      expect(response.body.debug.stack).toContain('TypeError: async boom');
    });

    it('should return JSON 404 envelope for unknown routes', async () => {
      // Act
      const response = await request(app).get('/no/such/route');

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NOT_FOUND');
      expect(response.body.error).toContain('GET /no/such/route');
    });

    it('should echo an incoming x-request-id', async () => {
      // Act
      const response = await request(app)
        .get('/throws-app-error')
        .set('x-request-id', 'upstream-id-42');

      // Assert
      expect(response.headers['x-request-id']).toBe('upstream-id-42');
      expect(response.body.requestId).toBe('upstream-id-42');
    });
  });

  describe('in production mode', () => {
    const app = buildApp(true);

    it('should keep operational messages but omit debug', async () => {
      // Act
      const response = await request(app).get('/throws-app-error');

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Student not found');
      expect(response.body.debug).toBeUndefined();
    });

    it('should mask unexpected errors', async () => {
      // Act
      const response = await request(app).get('/throws-async');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('An unexpected error occurred. Please try again.');
      expect(response.body.requestId).toBeDefined();
      expect(JSON.stringify(response.body)).not.toContain('async boom');
    });

    it('should keep validation details for clients', async () => {
      // Act
      const response = await request(app).get('/throws-validation');

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.details).toEqual({ fieldErrors: { email: ['Invalid email'] } });
    });
  });

  describe('error reporting', () => {
    it('should report non-operational errors but not operational ones', async () => {
      // Arrange
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
      const app = buildApp(true);

      // Act
      await request(app).get('/throws-app-error');
      await request(app).get('/throws-async');

      // Assert
      expect(captured).toHaveLength(1);
      expect(captured[0]).toBeInstanceOf(TypeError);
    });
  });
});
