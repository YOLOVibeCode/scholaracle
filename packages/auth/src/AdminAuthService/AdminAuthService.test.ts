import jwt from 'jsonwebtoken';
import { MongoClient, type Db } from 'mongodb';
import { AdminAuthService } from './AdminAuthService';
import { AdminUserRepository } from '@scholaracle/database';
import { MFAService } from '../MFAService';

describe('AdminAuthService', () => {
  let client: MongoClient;
  let database: Db;
  let authService: AdminAuthService;
  let adminRepository: AdminUserRepository;
  let mfaService: MFAService;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    adminRepository = new AdminUserRepository(database);
    mfaService = new MFAService();
    authService = new AdminAuthService(database, 'test-secret', undefined, mfaService);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('admin_users').deleteMany({});
  });

  describe('register', () => {
    it('should register new admin (super_admin only)', async () => {
      // Create a super_admin first
      const passwordHash = await AdminUserRepository.hashPassword('SuperPass123!');
      const superAdmin = await adminRepository.create({
        email: 'super@test.com',
        passwordHash,
        name: 'Super Admin',
        role: 'super_admin',
      });

      const result = await authService.register(
        'newadmin@test.com',
        'NewPass123!',
        'New Admin',
        'admin',
        superAdmin._id!.toString()
      );

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.admin).toBeDefined();
    });

    it('should reject registration without super_admin', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('AdminPass123!');
      const regularAdmin = await adminRepository.create({
        email: 'admin@test.com',
        passwordHash,
        name: 'Regular Admin',
        role: 'admin',
      });

      const result = await authService.register(
        'newadmin@test.com',
        'NewPass123!',
        'New Admin',
        'admin',
        regularAdmin._id!.toString()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('super_admin');
    });

    it('should reject duplicate email', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('SuperPass123!');
      const superAdmin = await adminRepository.create({
        email: 'super@test.com',
        passwordHash,
        name: 'Super Admin',
        role: 'super_admin',
      });

      await authService.register(
        'duplicate@test.com',
        'Pass123!',
        'Admin',
        'admin',
        superAdmin._id!.toString()
      );

      const result = await authService.register(
        'duplicate@test.com',
        'Pass123!',
        'Admin',
        'admin',
        superAdmin._id!.toString()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });
  });

  describe('login', () => {
    it('should login with valid credentials', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('LoginPass123!');
      await adminRepository.create({
        email: 'login@test.com',
        passwordHash,
        name: 'Login Admin',
        role: 'admin',
      });

      const result = await authService.login('login@test.com', 'LoginPass123!');

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.admin).toBeDefined();
    });

    it('should reject non-existent email', async () => {
      const result = await authService.login('nobody@test.com', 'Password123!');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should reject invalid credentials', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('CorrectPass123!');
      await adminRepository.create({
        email: 'invalid@test.com',
        passwordHash,
        name: 'Invalid Admin',
        role: 'admin',
      });

      const result = await authService.login('invalid@test.com', 'WrongPass123!');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should reject inactive admin', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('InactivePass123!');
      const admin = await adminRepository.create({
        email: 'inactive@test.com',
        passwordHash,
        name: 'Inactive Admin',
        role: 'admin',
      });
      await adminRepository.deactivate(admin._id!.toString());

      const result = await authService.login('inactive@test.com', 'InactivePass123!');

      expect(result.success).toBe(false);
      expect(result.error).toContain('inactive');
    });

    it('should require MFA after setup', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('MFAPass123!');
      const admin = await adminRepository.create({
        email: 'mfa@test.com',
        passwordHash,
        name: 'MFA Admin',
        role: 'admin',
      });

      // Setup MFA
      const { secret } = mfaService.generateSecret('mfa@test.com');
      await adminRepository.update(admin._id!.toString(), {
        mfaEnabled: true,
        mfaSecret: secret,
      });

      const result = await authService.login('mfa@test.com', 'MFAPass123!');

      expect(result.success).toBe(false);
      expect(result.requiresMFA).toBe(true);
      expect(result.mfaToken).toBeDefined();
    });
  });

  describe('verifyMFAToken', () => {
    it('should verify valid MFA token', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('MFAPass123!');
      const admin = await adminRepository.create({
        email: 'mfaverify@test.com',
        passwordHash,
        name: 'MFA Verify Admin',
        role: 'admin',
      });

      const { secret } = mfaService.generateSecret('mfaverify@test.com');
      await adminRepository.update(admin._id!.toString(), {
        mfaEnabled: true,
        mfaSecret: secret,
      });

      // Generate valid token
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret,
        encoding: 'base32',
      });

      const loginResult = await authService.login('mfaverify@test.com', 'MFAPass123!');
      expect(loginResult.requiresMFA).toBe(true);

      const verifyResult = await authService.verifyMFAToken(loginResult.mfaToken!, token);

      expect(verifyResult.success).toBe(true);
      expect(verifyResult.token).toBeDefined();
    });

    it('should reject invalid MFA token', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('MFAPass123!');
      const admin = await adminRepository.create({
        email: 'mfainvalid@test.com',
        passwordHash,
        name: 'MFA Invalid Admin',
        role: 'admin',
      });

      const { secret } = mfaService.generateSecret('mfainvalid@test.com');
      await adminRepository.update(admin._id!.toString(), {
        mfaEnabled: true,
        mfaSecret: secret,
      });

      const loginResult = await authService.login('mfainvalid@test.com', 'MFAPass123!');
      expect(loginResult.requiresMFA).toBe(true);

      const verifyResult = await authService.verifyMFAToken(loginResult.mfaToken!, '000000');

      expect(verifyResult.success).toBe(false);
    });
  });

  describe('verifyMFAToken edge cases', () => {
    it('should reject a fabricated MFA token with wrong type', async () => {
      // Create a token with type !== 'mfa'
      const fakeToken = jwt.sign(
        { adminId: 'fake-id', type: 'admin', expiresAt: Date.now() + 300000 },
        'test-secret'
      );

      const result = await authService.verifyMFAToken(fakeToken, '123456');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid MFA token');
    });

    it('should reject a completely invalid MFA token string', async () => {
      const result = await authService.verifyMFAToken('completely-invalid', '123456');
      expect(result.success).toBe(false);
    });
  });

  describe('verifyToken', () => {
    it('should verify valid admin token', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('TokenPass123!');
      const admin = await adminRepository.create({
        email: 'token@test.com',
        passwordHash,
        name: 'Token Admin',
        role: 'admin',
      });

      const loginResult = await authService.login('token@test.com', 'TokenPass123!');
      const verifyResult = await authService.verifyToken(loginResult.token!);

      expect(verifyResult).not.toBeNull();
      expect(verifyResult?.adminId).toBe(admin._id!.toString());
      expect(verifyResult?.role).toBe('admin');
    });

    it('should reject invalid token', async () => {
      const verifyResult = await authService.verifyToken('invalid-token');
      expect(verifyResult).toBeNull();
    });

    it('should return null for deactivated admin', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('DeactivatePass123!');
      const admin = await adminRepository.create({
        email: 'deactivate@test.com',
        passwordHash,
        name: 'Deactivate Admin',
        role: 'admin',
      });

      const loginResult = await authService.login('deactivate@test.com', 'DeactivatePass123!');
      expect(loginResult.success).toBe(true);

      // Deactivate admin after login
      await adminRepository.deactivate(admin._id!.toString());

      const verifyResult = await authService.verifyToken(loginResult.token!);
      expect(verifyResult).toBeNull();
    });

    it('should return null for token with wrong type', async () => {
      const fakeToken = jwt.sign(
        { adminId: 'fake-id', email: 'fake@test.com', role: 'admin', type: 'not-admin' },
        'test-secret'
      );

      const verifyResult = await authService.verifyToken(fakeToken);
      expect(verifyResult).toBeNull();
    });
  });

  describe('issueStepUpToken', () => {
    it('should issue step-up token for MFA-enabled admin', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('StepUpPass123!');
      const admin = await adminRepository.create({
        email: 'stepup@test.com',
        passwordHash,
        name: 'StepUp Admin',
        role: 'admin',
      });

      const { secret } = mfaService.generateSecret('stepup@test.com');
      await adminRepository.update(admin._id!.toString(), {
        mfaEnabled: true,
        mfaSecret: secret,
      });

      const token = await authService.issueStepUpToken(admin._id!.toString());
      expect(token).not.toBeNull();
      expect(typeof token).toBe('string');
    });

    it('should return null for admin without MFA enabled', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('NoMFAPass123!');
      const admin = await adminRepository.create({
        email: 'nomfa@test.com',
        passwordHash,
        name: 'NoMFA Admin',
        role: 'admin',
      });

      const token = await authService.issueStepUpToken(admin._id!.toString());
      expect(token).toBeNull();
    });

    it('should return null for non-existent admin', async () => {
      const token = await authService.issueStepUpToken('000000000000000000000000');
      expect(token).toBeNull();
    });
  });

  describe('verifyStepUpToken', () => {
    it('should verify a valid step-up token', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('VerifyStepPass123!');
      const admin = await adminRepository.create({
        email: 'verifystep@test.com',
        passwordHash,
        name: 'VerifyStep Admin',
        role: 'admin',
      });

      const { secret } = mfaService.generateSecret('verifystep@test.com');
      await adminRepository.update(admin._id!.toString(), {
        mfaEnabled: true,
        mfaSecret: secret,
      });

      const token = await authService.issueStepUpToken(admin._id!.toString());
      expect(token).not.toBeNull();

      const decoded = await authService.verifyStepUpToken(token!);
      expect(decoded).not.toBeNull();
      expect(decoded?.adminId).toBe(admin._id!.toString());
      expect(decoded?.type).toBe('step_up');
    });

    it('should reject invalid step-up token', async () => {
      const decoded = await authService.verifyStepUpToken('invalid-token');
      expect(decoded).toBeNull();
    });

    it('should reject token with wrong type', async () => {
      const fakeToken = jwt.sign(
        { adminId: 'fake-id', type: 'admin', issuedAt: Date.now(), expiresAt: Date.now() + 300000 },
        'test-secret'
      );

      const decoded = await authService.verifyStepUpToken(fakeToken);
      expect(decoded).toBeNull();
    });
  });

  describe('refreshToken', () => {
    it('should refresh a valid token', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('RefreshPass123!');
      await adminRepository.create({
        email: 'refresh@test.com',
        passwordHash,
        name: 'Refresh Admin',
        role: 'admin',
      });

      const loginResult = await authService.login('refresh@test.com', 'RefreshPass123!');
      expect(loginResult.success).toBe(true);

      // Wait briefly so the new token has a different iat
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const refreshResult = await authService.refreshToken(loginResult.token!);
      expect(refreshResult.success).toBe(true);
      expect(refreshResult.token).toBeDefined();
    });

    it('should reject invalid token for refresh', async () => {
      const result = await authService.refreshToken('invalid-token');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });
  });

  describe('logout', () => {
    it('should return true for valid token', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('LogoutPass123!');
      await adminRepository.create({
        email: 'logout@test.com',
        passwordHash,
        name: 'Logout Admin',
        role: 'admin',
      });

      const loginResult = await authService.login('logout@test.com', 'LogoutPass123!');
      const logoutResult = await authService.logout(loginResult.token!);
      expect(logoutResult).toBe(true);
    });

    it('should return true for invalid token (no jti to revoke)', async () => {
      const logoutResult = await authService.logout('invalid-token');
      expect(logoutResult).toBe(true);
    });
  });
});
