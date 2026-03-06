import { randomBytes } from 'crypto';
import type { Db } from 'mongodb';
import type { UserRepository } from '@scholaracle/database';

export interface IEmailTransferService {
  /**
   * Initiate an email transfer request.
   * Sends confirmation emails to both old and new addresses.
   */
  initiateUserTransfer(params: {
    userId: string;
    oldEmail: string;
    newEmail: string;
  }): Promise<{ oldEmailToken: string; newEmailToken: string }>;

  /**
   * Confirm email transfer from the old email address.
   */
  confirmOldEmail(params: { userId: string; token: string }): Promise<{ success: boolean }>;

  /**
   * Confirm email transfer from the new email address.
   * If both confirmations are present, completes the transfer.
   */
  confirmNewEmail(params: {
    userId: string;
    token: string;
  }): Promise<{ success: boolean; completed: boolean }>;

  /**
   * Cancel a pending email transfer.
   */
  cancelTransfer(params: { userId: string }): Promise<void>;

  /**
   * Check if both emails have confirmed and complete the transfer.
   */
  checkAndCompleteTransfer(params: { userId: string }): Promise<{ completed: boolean }>;
}

export interface IEmailTransferEmailService {
  sendTransferConfirmation(params: {
    to: string;
    name: string;
    newEmail?: string;
    oldEmail?: string;
    confirmUrl: string;
  }): Promise<void>;
}

export interface IEmailTransferServiceConfig {
  readonly database: Db;
  readonly userRepository: UserRepository;
  readonly baseUrl: string;
  readonly emailService?: IEmailTransferEmailService;
  readonly tokenExpiryHours?: number;
}

/**
 * Service for handling secure email transfer with dual confirmation.
 *
 * Flow:
 * 1. User initiates transfer (old email → new email)
 * 2. System sends confirmation emails to BOTH addresses
 * 3. Both must click confirmation links
 * 4. Once both confirm, transfer completes and email changes
 */
export class EmailTransferService implements IEmailTransferService {
  private readonly _db: Db;
  private readonly _userRepo: UserRepository;
  private readonly _baseUrl: string;
  private readonly _emailService?: IEmailTransferEmailService;
  private readonly _tokenExpiryHours: number;

  constructor(config: IEmailTransferServiceConfig) {
    this._db = config.database;
    this._userRepo = config.userRepository;
    this._baseUrl = config.baseUrl;
    this._emailService = config.emailService;
    this._tokenExpiryHours = config.tokenExpiryHours ?? 48;
  }

  /**
   * Initiate user email transfer.
   * Creates tokens and stores pending request.
   */
  public async initiateUserTransfer(params: {
    userId: string;
    oldEmail: string;
    newEmail: string;
  }): Promise<{ oldEmailToken: string; newEmailToken: string }> {
    const { userId, oldEmail, newEmail } = params;

    // Check if new email already exists
    const existingUser = await this._userRepo.findByEmail(newEmail);
    if (existingUser && existingUser._id?.toString() !== userId) {
      throw new Error('New email address is already registered');
    }

    // Generate secure tokens
    const oldEmailToken = randomBytes(32).toString('hex');
    const newEmailToken = randomBytes(32).toString('hex');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this._tokenExpiryHours * 60 * 60 * 1000);

    // Store transfer request
    const transferRequest = {
      newEmail,
      initiatedAt: now,
      expiresAt,
      oldEmailToken,
      newEmailToken,
    };

    await this._userRepo.update(userId, { emailTransferRequest: transferRequest });

    // Send confirmation emails
    const user = await this._userRepo.findById(userId);
    if (user && this._emailService) {
      const oldConfirmUrl = `${this._baseUrl}/api/account/email-transfer/confirm-old?token=${oldEmailToken}&userId=${userId}`;
      const newConfirmUrl = `${this._baseUrl}/api/account/email-transfer/confirm-new?token=${newEmailToken}&userId=${userId}`;

      await Promise.all([
        this._emailService.sendTransferConfirmation({
          to: oldEmail,
          name: user.name,
          newEmail,
          confirmUrl: oldConfirmUrl,
        }),
        this._emailService.sendTransferConfirmation({
          to: newEmail,
          name: user.name,
          oldEmail,
          confirmUrl: newConfirmUrl,
        }),
      ]);
    }

    return { oldEmailToken, newEmailToken };
  }

  /**
   * Confirm from old email address.
   */
  public async confirmOldEmail(params: {
    userId: string;
    token: string;
  }): Promise<{ success: boolean }> {
    const user = await this._userRepo.findById(params.userId);
    if (!user || !user.emailTransferRequest) {
      throw new Error('No pending email transfer found');
    }

    if (user.emailTransferRequest.expiresAt < new Date()) {
      await this._userRepo.update(params.userId, { emailTransferRequest: undefined });
      throw new Error('Email transfer request expired');
    }

    if (user.emailTransferRequest.oldEmailToken !== params.token) {
      throw new Error('Invalid confirmation token');
    }

    // Mark old email as confirmed (we'll use a confirmed flag pattern)
    // Store confirmation in a temp collection or in the request itself
    const confirmColl = this._db.collection('email_transfer_confirmations');
    await confirmColl.updateOne(
      { userId: params.userId, type: 'old' },
      { $set: { userId: params.userId, type: 'old', confirmedAt: new Date() } },
      { upsert: true }
    );

    // Check if both are confirmed
    await this.checkAndCompleteTransfer({ userId: params.userId });

    return { success: true };
  }

  /**
   * Confirm from new email address.
   */
  public async confirmNewEmail(params: {
    userId: string;
    token: string;
  }): Promise<{ success: boolean; completed: boolean }> {
    const user = await this._userRepo.findById(params.userId);
    if (!user || !user.emailTransferRequest) {
      throw new Error('No pending email transfer found');
    }

    if (user.emailTransferRequest.expiresAt < new Date()) {
      await this._userRepo.update(params.userId, { emailTransferRequest: undefined });
      throw new Error('Email transfer request expired');
    }

    if (user.emailTransferRequest.newEmailToken !== params.token) {
      throw new Error('Invalid confirmation token');
    }

    // Mark new email as confirmed
    const confirmColl = this._db.collection('email_transfer_confirmations');
    await confirmColl.updateOne(
      { userId: params.userId, type: 'new' },
      { $set: { userId: params.userId, type: 'new', confirmedAt: new Date() } },
      { upsert: true }
    );

    // Check if both are confirmed
    const result = await this.checkAndCompleteTransfer({ userId: params.userId });

    return { success: true, completed: result.completed };
  }

  /**
   * Check if both confirmations exist and complete the transfer.
   */
  public async checkAndCompleteTransfer(params: {
    userId: string;
  }): Promise<{ completed: boolean }> {
    const confirmColl = this._db.collection('email_transfer_confirmations');

    const [oldConfirm, newConfirm] = await Promise.all([
      confirmColl.findOne({ userId: params.userId, type: 'old' }),
      confirmColl.findOne({ userId: params.userId, type: 'new' }),
    ]);

    if (!oldConfirm || !newConfirm) {
      return { completed: false };
    }

    // Both confirmed - complete the transfer
    const user = await this._userRepo.findById(params.userId);
    if (!user || !user.emailTransferRequest) {
      return { completed: false };
    }

    // Update email
    await this._userRepo.update(params.userId, {
      email: user.emailTransferRequest.newEmail,
      emailTransferRequest: undefined,
    });

    // Clean up confirmation records
    await confirmColl.deleteMany({ userId: params.userId });

    return { completed: true };
  }

  /**
   * Cancel a pending email transfer.
   */
  public async cancelTransfer(params: { userId: string }): Promise<void> {
    await this._userRepo.update(params.userId, { emailTransferRequest: undefined });

    // Clean up any partial confirmations
    const confirmColl = this._db.collection('email_transfer_confirmations');
    await confirmColl.deleteMany({ userId: params.userId });
  }
}
