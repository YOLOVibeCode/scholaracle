import {
  ValidationError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  InternalError,
  ERROR_CODES,
} from '@scholaracle/contracts';
import { serializeError } from './serializeError';

const REQUEST_ID = 'req-test-123';

describe('serializeError', () => {
  describe('operational AppErrors', () => {
    it.each([
      [new ValidationError('Bad input'), 400, ERROR_CODES.VALIDATION_ERROR],
      [new AuthenticationError('Token expired'), 401, ERROR_CODES.UNAUTHENTICATED],
      [new ForbiddenError('Not yours'), 403, ERROR_CODES.FORBIDDEN],
      [new NotFoundError('Student not found'), 404, ERROR_CODES.NOT_FOUND],
      [new ConflictError('Duplicate email'), 409, ERROR_CODES.CONFLICT],
      [new RateLimitError('Slow down'), 429, ERROR_CODES.RATE_LIMITED],
      [new ExternalServiceError('Square unavailable'), 502, ERROR_CODES.EXTERNAL_SERVICE_ERROR],
    ])('should pass through %s message in production', (error, status, code) => {
      // Act
      const result = serializeError(error, REQUEST_ID, true);

      // Assert
      expect(result.status).toBe(status);
      expect(result.body.success).toBe(false);
      expect(result.body.error).toBe(error.message);
      expect(result.body.code).toBe(code);
      expect(result.body.requestId).toBe(REQUEST_ID);
      expect(result.body.debug).toBeUndefined();
    });

    it('should include debug block outside production', () => {
      // Act
      const result = serializeError(new NotFoundError('Student not found'), REQUEST_ID, false);

      // Assert
      expect(result.body.error).toBe('Student not found');
      expect(result.body.debug).toBeDefined();
      expect(result.body.debug?.name).toBe('NotFoundError');
      expect(result.body.debug?.stack).toContain('NotFoundError');
    });

    it('should expose operational details in production (validation field errors)', () => {
      // Arrange
      const error = ValidationError.fromZod({
        issues: [{ path: ['email'], message: 'Invalid email' }],
      });

      // Act
      const result = serializeError(error, REQUEST_ID, true);

      // Assert
      expect(result.body.details).toEqual({ fieldErrors: { email: ['Invalid email'] } });
    });
  });

  describe('non-operational errors', () => {
    it('should mask unexpected errors in production', () => {
      // Act
      const result = serializeError(new TypeError('boom internal detail'), REQUEST_ID, true);

      // Assert
      expect(result.status).toBe(500);
      expect(result.body.error).toBe('An unexpected error occurred. Please try again.');
      expect(result.body.code).toBe(ERROR_CODES.INTERNAL_ERROR);
      expect(result.body.debug).toBeUndefined();
      expect(JSON.stringify(result.body)).not.toContain('boom internal detail');
    });

    it('should surface unexpected error details outside production', () => {
      // Act
      const result = serializeError(new TypeError('boom internal detail'), REQUEST_ID, false);

      // Assert
      expect(result.status).toBe(500);
      expect(result.body.error).toBe('boom internal detail');
      expect(result.body.debug?.stack).toContain('TypeError: boom internal detail');
    });

    it('should mask InternalError message in production even though it is an AppError', () => {
      // Act
      const result = serializeError(
        new InternalError('db connection string leaked'),
        undefined,
        true
      );

      // Assert
      expect(result.body.error).toBe('An unexpected error occurred. Please try again.');
      expect(result.body.requestId).toBeUndefined();
    });

    it('should handle non-Error throwables', () => {
      // Act
      const result = serializeError('string throw', REQUEST_ID, false);

      // Assert
      expect(result.status).toBe(500);
      expect(result.body.error).toBe('string throw');
    });
  });

  describe('express/body-parser 4xx errors', () => {
    it('should honor a 4xx status property and stay operational (not masked)', () => {
      // Arrange: shape thrown by body-parser on malformed JSON
      const parseError = new SyntaxError('Unexpected token { in JSON at position 1');
      (parseError as unknown as { status: number }).status = 400;

      // Act
      const result = serializeError(parseError, REQUEST_ID, true);

      // Assert
      expect(result.status).toBe(400);
      expect(result.body.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(result.body.error).toBe('Unexpected token { in JSON at position 1');
    });

    it('should ignore non-4xx status properties', () => {
      // Arrange
      const serverError = new Error('upstream exploded');
      (serverError as unknown as { status: number }).status = 502;

      // Act
      const result = serializeError(serverError, REQUEST_ID, true);

      // Assert
      expect(result.status).toBe(500);
      expect(result.body.error).toBe('An unexpected error occurred. Please try again.');
    });
  });

  describe('ZodError mapping', () => {
    it('should map ZodError-shaped errors to 400 with field details', () => {
      // Arrange
      const zodError = new Error('validation');
      zodError.name = 'ZodError';
      (zodError as unknown as { issues: unknown[] }).issues = [
        { path: ['name'], message: 'Required' },
      ];

      // Act
      const result = serializeError(zodError, REQUEST_ID, true);

      // Assert
      expect(result.status).toBe(400);
      expect(result.body.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(result.body.details).toEqual({ fieldErrors: { name: ['Required'] } });
    });
  });
});
