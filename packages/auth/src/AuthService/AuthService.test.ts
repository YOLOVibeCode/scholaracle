import { MongoClient, type Db } from 'mongodb';
import { AuthService } from './AuthService';
import { UserRepository } from '@scholaracle/database';

describe('AuthService', () => {
  let client: MongoClient;
  let database: Db;
  let authService: AuthService;
  let userRepository: UserRepository;

  const TEST_SECRET = 'test-jwt-secret';
  const TEST_EXPIRES = '1h';

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_auth_test');
    authService = new AuthService(database, TEST_SECRET, TEST_EXPIRES);
    userRepository = new UserRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('users').deleteMany({});
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const result = await authService.register('test@example.com', 'Password123!', 'Test User');

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user?.email).toBe('test@example.com');
      expect(result.user?.name).toBe('Test User');
      expect(result.user?.id).toBeDefined();
    });

    it('should persist user in database after registration', async () => {
      await authService.register('persist@example.com', 'Password123!', 'Persist User');

      const user = await userRepository.findByEmail('persist@example.com');
      expect(user).not.toBeNull();
      expect(user?.email).toBe('persist@example.com');
      expect(user?.name).toBe('Persist User');
    });

    it('should reject duplicate email', async () => {
      await authService.register('dup@example.com', 'Password123!', 'First User');
      const result = await authService.register('dup@example.com', 'Password456!', 'Second User');

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should return a valid JWT token', async () => {
      const result = await authService.register('jwt@example.com', 'Password123!', 'JWT User');

      expect(result.success).toBe(true);
      const decoded = await authService.verifyToken(result.token!);
      expect(decoded).not.toBeNull();
      expect(decoded?.email).toBe('jwt@example.com');
      expect(decoded?.userId).toBeDefined();
    });

    it('should hash password (not store plaintext)', async () => {
      await authService.register('hash@example.com', 'Password123!', 'Hash User');

      const user = await userRepository.findByEmail('hash@example.com');
      expect(user).not.toBeNull();
      expect(user?.passwordHash).not.toBe('Password123!');
      expect(user?.passwordHash.length).toBeGreaterThan(20);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await authService.register('login@example.com', 'LoginPass123!', 'Login User');
    });

    it('should login with valid credentials', async () => {
      const result = await authService.login('login@example.com', 'LoginPass123!');

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user?.email).toBe('login@example.com');
      expect(result.user?.name).toBe('Login User');
    });

    it('should reject wrong password', async () => {
      const result = await authService.login('login@example.com', 'WrongPass123!');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should reject non-existent email', async () => {
      const result = await authService.login('nonexistent@example.com', 'Password123!');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should return a valid JWT token on login', async () => {
      const result = await authService.login('login@example.com', 'LoginPass123!');

      expect(result.success).toBe(true);
      const decoded = await authService.verifyToken(result.token!);
      expect(decoded).not.toBeNull();
      expect(decoded?.email).toBe('login@example.com');
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', async () => {
      const registerResult = await authService.register(
        'verify@example.com',
        'Password123!',
        'Verify User'
      );
      const decoded = await authService.verifyToken(registerResult.token!);

      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(registerResult.user?.id);
      expect(decoded?.email).toBe('verify@example.com');
    });

    it('should return null for invalid token', async () => {
      const decoded = await authService.verifyToken('invalid-token-string');
      expect(decoded).toBeNull();
    });

    it('should return null for token signed with different secret', async () => {
      const otherService = new AuthService(database, 'different-secret');
      const result = await otherService.register('other@example.com', 'Password123!', 'Other User');

      // Verify with original service (different secret)
      const decoded = await authService.verifyToken(result.token!);
      expect(decoded).toBeNull();
    });

    it('should return null for expired token', async () => {
      const expiredService = new AuthService(database, TEST_SECRET, '0s');
      const result = await expiredService.register(
        'expired@example.com',
        'Password123!',
        'Expired User'
      );

      // Token should be expired immediately
      await new Promise((resolve) => setTimeout(resolve, 100));
      const decoded = await authService.verifyToken(result.token!);
      expect(decoded).toBeNull();
    });
  });

  describe('issueTokenForUser', () => {
    it('should issue a token for a given user ID and email', async () => {
      const token = authService.issueTokenForUser('some-user-id', 'admin@example.com');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should produce a verifiable token', async () => {
      const token = authService.issueTokenForUser('test-id-123', 'issued@example.com');
      const decoded = await authService.verifyToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe('test-id-123');
      expect(decoded?.email).toBe('issued@example.com');
    });
  });

  describe('requestPasswordReset', () => {
    const mockTokenStore = {
      create: jest.fn(),
      findValidByToken: jest.fn(),
      invalidateForUser: jest.fn(),
    };
    const mockEmailSender = {
      sendResetLink: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return success when user does not exist (no email enumeration)', async () => {
      const service = new AuthService(
        database,
        TEST_SECRET,
        TEST_EXPIRES,
        mockTokenStore,
        mockEmailSender,
        'https://app.example.com'
      );
      const result = await service.requestPasswordReset('nonexistent@example.com');

      expect(result.success).toBe(true);
      expect(mockTokenStore.create).not.toHaveBeenCalled();
      expect(mockEmailSender.sendResetLink).not.toHaveBeenCalled();
    });

    it('should invalidate existing tokens, create new token, and send email when user exists', async () => {
      await authService.register('reset@example.com', 'Password123!', 'Reset User');
      const user = await userRepository.findByEmail('reset@example.com');
      expect(user).not.toBeNull();

      const service = new AuthService(
        database,
        TEST_SECRET,
        TEST_EXPIRES,
        mockTokenStore,
        mockEmailSender,
        'https://app.example.com'
      );
      const result = await service.requestPasswordReset('reset@example.com');

      expect(result.success).toBe(true);
      expect(mockTokenStore.invalidateForUser).toHaveBeenCalledWith(user!._id!.toString());
      expect(mockTokenStore.create).toHaveBeenCalledTimes(1);
      expect(mockTokenStore.create).toHaveBeenCalledWith(
        user!._id!.toString(),
        expect.any(String),
        expect.any(Date)
      );
      expect(mockEmailSender.sendResetLink).toHaveBeenCalledWith(
        'reset@example.com',
        expect.stringMatching(/^https:\/\/app\.example\.com\/reset-password\?token=/)
      );
    });

    it('should return success false when password reset not configured', async () => {
      const service = new AuthService(database, TEST_SECRET, TEST_EXPIRES);
      const result = await service.requestPasswordReset('any@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('resetPasswordWithToken', () => {
    const mockTokenStore = {
      create: jest.fn(),
      findValidByToken: jest.fn(),
      invalidateForUser: jest.fn(),
    };
    const mockEmailSender = { sendResetLink: jest.fn() };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should update password and invalidate token when token is valid', async () => {
      await authService.register('resetuser@example.com', 'OldPass123!', 'Reset User');
      const user = await userRepository.findByEmail('resetuser@example.com');
      const userId = user!._id!.toString();

      mockTokenStore.findValidByToken.mockResolvedValue({ userId });
      mockTokenStore.invalidateForUser.mockResolvedValue(undefined);

      const service = new AuthService(
        database,
        TEST_SECRET,
        TEST_EXPIRES,
        mockTokenStore,
        mockEmailSender
      );
      const result = await service.resetPasswordWithToken('valid-token-123', 'NewPass456!');

      expect(result.success).toBe(true);
      expect(mockTokenStore.invalidateForUser).toHaveBeenCalledWith(userId);

      const updated = await userRepository.findById(userId);
      expect(updated).not.toBeNull();
      const validNew = await UserRepository.verifyPassword('NewPass456!', updated!.passwordHash);
      expect(validNew).toBe(true);
    });

    it('should return error when token is invalid or expired', async () => {
      mockTokenStore.findValidByToken.mockResolvedValue(null);

      const service = new AuthService(
        database,
        TEST_SECRET,
        TEST_EXPIRES,
        mockTokenStore,
        mockEmailSender
      );
      const result = await service.resetPasswordWithToken('invalid-token', 'NewPass456!');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid|expired/i);
      expect(mockTokenStore.invalidateForUser).not.toHaveBeenCalled();
    });

    it('should return success false when password reset not configured', async () => {
      const service = new AuthService(database, TEST_SECRET, TEST_EXPIRES);
      const result = await service.resetPasswordWithToken('any-token', 'NewPass123!');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
