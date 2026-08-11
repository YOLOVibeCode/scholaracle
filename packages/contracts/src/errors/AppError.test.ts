import { AppError } from './AppError';
import {
  ValidationError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  InternalError,
} from './httpErrors';
import { ERROR_CODES } from './errorCodes';
import {
  NoopErrorReporter,
  getErrorReporter,
  setErrorReporter,
  type IErrorReporter,
} from './ErrorReporter';

describe('AppError', () => {
  describe('constructor', () => {
    it('should default to 500 / INTERNAL_ERROR / operational', () => {
      // Act
      const error = new AppError('Something broke');

      // Assert
      expect(error.message).toBe('Something broke');
      expect(error.status).toBe(500);
      expect(error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
      expect(error.isOperational).toBe(true);
      expect(error.details).toBeUndefined();
      expect(error.name).toBe('AppError');
    });

    it('should accept status, code, isOperational, details, and cause', () => {
      // Arrange
      const cause = new Error('root cause');

      // Act
      const error = new AppError('Teapot', {
        status: 418,
        code: 'TEAPOT',
        isOperational: false,
        details: { field: 'spout' },
        cause,
      });

      // Assert
      expect(error.status).toBe(418);
      expect(error.code).toBe('TEAPOT');
      expect(error.isOperational).toBe(false);
      expect(error.details).toEqual({ field: 'spout' });
      expect(error.cause).toBe(cause);
    });

    it('should be instance of Error and have a stack trace', () => {
      // Act
      const error = new AppError('Test');

      // Assert
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.stack).toBeDefined();
    });
  });

  describe('subclasses', () => {
    it.each([
      [new ValidationError(), 400, ERROR_CODES.VALIDATION_ERROR, true],
      [new AuthenticationError(), 401, ERROR_CODES.UNAUTHENTICATED, true],
      [new ForbiddenError(), 403, ERROR_CODES.FORBIDDEN, true],
      [new NotFoundError(), 404, ERROR_CODES.NOT_FOUND, true],
      [new ConflictError(), 409, ERROR_CODES.CONFLICT, true],
      [new RateLimitError(), 429, ERROR_CODES.RATE_LIMITED, true],
      [new ExternalServiceError(), 502, ERROR_CODES.EXTERNAL_SERVICE_ERROR, true],
      [new InternalError(), 500, ERROR_CODES.INTERNAL_ERROR, false],
    ])('%s should map to status %i / code %s', (error, status, code, isOperational) => {
      expect(error).toBeInstanceOf(AppError);
      expect(error.status).toBe(status);
      expect(error.code).toBe(code);
      expect(error.isOperational).toBe(isOperational);
      expect(error.name).toBe(error.constructor.name);
    });

    it('should preserve custom messages', () => {
      // Act
      const error = new NotFoundError('Student not found');

      // Assert
      expect(error.message).toBe('Student not found');
    });
  });

  describe('ValidationError.fromZod', () => {
    it('should map issues to per-field message arrays', () => {
      // Arrange
      const zodLike = {
        issues: [
          { path: ['email'], message: 'Invalid email' },
          { path: ['email'], message: 'Required' },
          { path: ['profile', 'age'], message: 'Must be positive' },
          { path: [], message: 'Unrecognized keys' },
        ],
      };

      // Act
      const error = ValidationError.fromZod(zodLike);

      // Assert
      expect(error.status).toBe(400);
      expect(error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(error.details).toEqual({
        fieldErrors: {
          email: ['Invalid email', 'Required'],
          'profile.age': ['Must be positive'],
          _root: ['Unrecognized keys'],
        },
      });
    });
  });
});

describe('ErrorReporter', () => {
  afterEach(() => {
    setErrorReporter(new NoopErrorReporter());
  });

  it('should default to a no-op reporter', () => {
    // Act
    const reporter = getErrorReporter();

    // Assert
    expect(reporter).toBeInstanceOf(NoopErrorReporter);
    expect(() => reporter.captureException(new Error('x'))).not.toThrow();
    expect(() => reporter.captureMessage('x')).not.toThrow();
  });

  it('should return the reporter set via setErrorReporter', () => {
    // Arrange
    const captured: unknown[] = [];
    const custom: IErrorReporter = {
      captureException: (error): void => {
        captured.push(error);
      },
      captureMessage: (message): void => {
        captured.push(message);
      },
    };

    // Act
    setErrorReporter(custom);
    getErrorReporter().captureException(new Error('boom'));
    getErrorReporter().captureMessage('note');

    // Assert
    expect(getErrorReporter()).toBe(custom);
    expect(captured).toHaveLength(2);
  });
});
