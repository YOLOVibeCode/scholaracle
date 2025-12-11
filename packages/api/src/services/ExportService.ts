import type { Db } from 'mongodb';
import { UserRepository } from '@scholaracle/database';

export interface IExportService {
  exportCustomers(startDate?: Date, endDate?: Date): Promise<string>;
  exportPayments(startDate?: Date, endDate?: Date): Promise<string>;
  exportSubscriptions(startDate?: Date, endDate?: Date): Promise<string>;
}

/**
 * Export service for generating CSV reports.
 */
export class ExportService implements IExportService {
  private readonly _userRepository: UserRepository;
  private readonly _database: Db;

  constructor(database: Db) {
    this._database = database;
    this._userRepository = new UserRepository(database);
  }

  /**
   * Export customers to CSV format.
   *
   * @param startDate - Optional start date filter
   * @param endDate - Optional end date filter
   * @returns CSV string
   */
  public async exportCustomers(startDate?: Date, endDate?: Date): Promise<string> {
    let filters: Record<string, unknown> = {};

    if (startDate || endDate) {
      filters['createdAt'] = {};
      if (startDate) {
        filters['createdAt'] = { $gte: startDate };
      }
      if (endDate) {
        filters['createdAt'] = {
          ...(filters['createdAt'] as Record<string, unknown>),
          $lte: endDate,
        };
      }
    }

    const users = await this._userRepository.findWithPagination({
      page: 1,
      limit: 10000,
      filters,
      sort: { createdAt: -1 },
    });

    // CSV header
    const headers = [
      'ID',
      'Email',
      'Name',
      'Phone',
      'Plan',
      'Status',
      'Suspended',
      'Created At',
    ];

    const rows = users.data.map((user) => [
      user._id?.toString() ?? '',
      user.email,
      user.name,
      user.phone ?? '',
      user.subscription.plan,
      user.subscription.status,
      user.isSuspended ? 'Yes' : 'No',
      user.createdAt.toISOString(),
    ]);

    return this._generateCSV(headers, rows);
  }

  /**
   * Export payments to CSV format.
   *
   * @param startDate - Optional start date filter
   * @param endDate - Optional end date filter
   * @returns CSV string
   */
  public async exportPayments(startDate?: Date, endDate?: Date): Promise<string> {
    const paymentsCollection = this._database.collection('payments');

    let query: Record<string, unknown> = {};
    if (startDate || endDate) {
      query['createdAt'] = {};
      if (startDate) {
        query['createdAt'] = { $gte: startDate };
      }
      if (endDate) {
        query['createdAt'] = {
          ...(query['createdAt'] as Record<string, unknown>),
          $lte: endDate,
        };
      }
    }

    const payments = await paymentsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(10000)
      .toArray();

    // Get user emails for payments
    const userIds = [...new Set(payments.map((p) => p['userId'] as string))];
    const userMap = new Map<string, string>();

    for (const userId of userIds) {
      const user = await this._userRepository.findById(userId);
      if (user) {
        userMap.set(userId, user.email);
      }
    }

    const headers = [
      'Payment ID',
      'User Email',
      'Amount',
      'Currency',
      'Status',
      'Payment Method',
      'Created At',
    ];

    const rows = payments.map((payment) => [
      (payment['_id'] as { toString: () => string })?.toString() ?? '',
      userMap.get(payment['userId'] as string) ?? 'Unknown',
      String(((payment['amount'] as number) ?? 0) / 100), // Convert cents to dollars
      (payment['currency'] as string) ?? 'usd',
      (payment['status'] as string) ?? 'unknown',
      (payment['paymentMethod'] as string) ?? 'unknown',
      (payment['createdAt'] as Date)?.toISOString() ?? '',
    ]);

    return this._generateCSV(headers, rows);
  }

  /**
   * Export subscriptions to CSV format.
   *
   * @param startDate - Optional start date filter
   * @param endDate - Optional end date filter
   * @returns CSV string
   */
  public async exportSubscriptions(startDate?: Date, endDate?: Date): Promise<string> {
    let filters: Record<string, unknown> = {};

    if (startDate || endDate) {
      filters['createdAt'] = {};
      if (startDate) {
        filters['createdAt'] = { $gte: startDate };
      }
      if (endDate) {
        filters['createdAt'] = {
          ...(filters['createdAt'] as Record<string, unknown>),
          $lte: endDate,
        };
      }
    }

    const users = await this._userRepository.findWithPagination({
      page: 1,
      limit: 10000,
      filters,
      sort: { createdAt: -1 },
    });

    const headers = [
      'User Email',
      'Name',
      'Plan',
      'Status',
      'Created At',
      'Last Updated',
    ];

    const rows = users.data.map((user) => [
      user.email,
      user.name,
      user.subscription.plan,
      user.subscription.status,
      user.createdAt.toISOString(),
      user.updatedAt.toISOString(),
    ]);

    return this._generateCSV(headers, rows);
  }

  /**
   * Generate CSV string from headers and rows.
   *
   * @param headers - Column headers
   * @param rows - Data rows
   * @returns CSV string
   */
  private _generateCSV(headers: readonly string[], rows: readonly (readonly string[])[]): string {
    const escapeCSV = (value: string): string => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const csvRows = [
      headers.map(escapeCSV).join(','),
      ...rows.map((row) => row.map(escapeCSV).join(',')),
    ];

    return csvRows.join('\n');
  }
}

