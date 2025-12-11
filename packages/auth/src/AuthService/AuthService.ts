import jwt from 'jsonwebtoken';
import type { Db } from 'mongodb';
import { UserRepository, UserRepository as UserRepo } from '@scholaracle/database';
import type { IUserData } from '@scholaracle/database';

export interface IAuthResult {
  readonly success: boolean;
  readonly token?: string;
  readonly user?: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
  };
  readonly error?: string;
}

export interface IAuthService {
  register(email: string, password: string, name: string): Promise<IAuthResult>;
  login(email: string, password: string): Promise<IAuthResult>;
  verifyToken(token: string): Promise<{ readonly userId: string; readonly email: string } | null>;
}

/**
 * Authentication service for user registration and login.
 */
export class AuthService implements IAuthService {
  private readonly _userRepository: UserRepository;
  private readonly _jwtSecret: string;
  private readonly _jwtExpiresIn: string;

  constructor(database: Db, jwtSecret?: string, jwtExpiresIn?: string) {
    this._userRepository = new UserRepository(database);
    this._jwtSecret = jwtSecret ?? process.env['JWT_SECRET'] ?? 'default-secret-change-in-production';
    this._jwtExpiresIn = jwtExpiresIn ?? process.env['JWT_EXPIRES_IN'] ?? '7d';
  }

  /**
   * Register a new user.
   *
   * @param email - User email
   * @param password - User password
   * @param name - User name
   * @returns Auth result with token
   */
  public async register(email: string, password: string, name: string): Promise<IAuthResult> {
    try {
      // Check if user already exists
      const existingUser = await this._userRepository.findByEmail(email);
      if (existingUser) {
        return {
          success: false,
          error: 'User already exists',
        };
      }

      // Hash password
      const passwordHash = await UserRepo.hashPassword(password);

      // Create user
      const userData: IUserData = {
        email,
        passwordHash,
        name,
      };

      const user = await this._userRepository.create(userData);

      // Generate token
      const token = this._generateToken(user._id?.toString() ?? '', email);

      return {
        success: true,
        token,
        user: {
          id: user._id?.toString() ?? '',
          email: user.email,
          name: user.name,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      };
    }
  }

  /**
   * Login user.
   *
   * @param email - User email
   * @param password - User password
   * @returns Auth result with token
   */
  public async login(email: string, password: string): Promise<IAuthResult> {
    try {
      // Find user
      const user = await this._userRepository.findByEmail(email);
      if (!user) {
        return {
          success: false,
          error: 'Invalid email or password',
        };
      }

      // Verify password
      const isValidPassword = await UserRepo.verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        return {
          success: false,
          error: 'Invalid email or password',
        };
      }

      // Generate token
      const token = this._generateToken(user._id?.toString() ?? '', email);

      return {
        success: true,
        token,
        user: {
          id: user._id?.toString() ?? '',
          email: user.email,
          name: user.name,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      };
    }
  }

  /**
   * Verify JWT token.
   *
   * @param token - JWT token
   * @returns Decoded token data or null if invalid
   */
  public async verifyToken(token: string): Promise<{ readonly userId: string; readonly email: string } | null> {
    try {
      const decoded = jwt.verify(token, this._jwtSecret) as { userId: string; email: string };

      return {
        userId: decoded.userId,
        email: decoded.email,
      };
    } catch {
      return null;
    }
  }

  /**
   * Generate JWT token.
   *
   * @param userId - User ID
   * @param email - User email
   * @returns JWT token
   */
  private _generateToken(userId: string, email: string): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    return jwt.sign(
      { userId, email },
      this._jwtSecret,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      { expiresIn: this._jwtExpiresIn } as jwt.SignOptions
    ) as string;
  }
}

