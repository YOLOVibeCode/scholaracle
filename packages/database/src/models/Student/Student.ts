import type { ObjectId } from 'mongodb';
import type { IStudentAlertPreferences } from '@scholaracle/contracts';

export interface IDataSourceCredentials {
  readonly encrypted: string;
  readonly iv: string;
}

export interface IDataSourceConfig {
  readonly institutionUrl?: string;
  readonly username?: string;
  readonly [key: string]: unknown;
}

export interface IDataSource {
  readonly id: string;
  readonly pluginId: string;
  readonly enabled: boolean;
  readonly credentials?: IDataSourceCredentials;
  readonly config?: IDataSourceConfig;
  readonly schedule?: string;
  readonly dataTypes?: readonly string[];
  readonly lastScraped?: Date;
  readonly lastSuccess?: Date;
  readonly lastError?: string | null;
  readonly status?: 'active' | 'error' | 'disabled';
  readonly stats?: {
    readonly totalScrapes?: number;
    readonly successRate?: number;
    readonly avgDuration?: number;
  };
}

export interface IStudentStats {
  readonly currentGPA?: number;
  readonly totalAssignments?: number;
  readonly missingAssignments?: number;
  readonly onTimeRate?: number;
  readonly lastUpdated?: Date;
}

export interface IStudentData {
  readonly userId: ObjectId | string;
  readonly name: string;
  readonly grade?: number;
  readonly studentId?: string;
  readonly dataSources?: readonly IDataSource[];
  readonly stats?: IStudentStats;
  readonly alertPreferences?: IStudentAlertPreferences;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * Student model representing a student profile.
 */
export class Student {
  public readonly _id?: ObjectId;
  public readonly userId: ObjectId | string;
  public readonly name: string;
  public readonly grade?: number;
  public readonly studentId?: string;
  public readonly dataSources: readonly IDataSource[];
  public readonly stats?: IStudentStats;
  public readonly alertPreferences?: IStudentAlertPreferences;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(data: IStudentData, id?: ObjectId) {
    this._id = id;
    this.userId = data.userId;
    this.name = data.name;
    this.grade = data.grade;
    this.studentId = data.studentId;
    this.dataSources = data.dataSources ?? [];
    this.stats = data.stats;
    this.alertPreferences = data.alertPreferences;
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
  }
}
