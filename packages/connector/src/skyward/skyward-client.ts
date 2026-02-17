// ---------------------------------------------------------------------------
// Raw response types (skyward-rest scraper output)
// ---------------------------------------------------------------------------

export interface ISkywardReportScore {
  readonly bucket: string;
  readonly score: number | null;
}

export interface ISkywardReport {
  readonly course: number;
  readonly scores: readonly ISkywardReportScore[];
}

export interface ISkywardAssignmentMeta {
  readonly type: 'absent' | 'noCount' | 'missing';
  readonly note?: string;
}

export interface ISkywardAssignment {
  readonly title: string;
  readonly score: number | null;
  readonly grade: number | null;
  readonly points: { readonly earned: number | null; readonly total: number | null };
  readonly date: string;
  readonly meta: readonly ISkywardAssignmentMeta[];
}

export interface ISkywardGradebookCategory {
  readonly category: string;
  readonly assignments: readonly ISkywardAssignment[];
}

export interface ISkywardGradebook {
  readonly course: string;
  readonly instructor: string;
  readonly period: number;
  readonly score: number;
  readonly grade: number;
  readonly gradebook: readonly ISkywardGradebookCategory[];
}

export interface ISkywardHistoryCourse {
  readonly course: string;
  readonly scores: readonly { readonly grade: number; readonly lit: string }[];
}

export interface ISkywardSchoolYear {
  readonly dates: { readonly begin: string; readonly end: string };
  readonly grade: number;
  readonly courses: readonly ISkywardHistoryCourse[];
}

// ---------------------------------------------------------------------------
// Extended data types (beyond what skyward-rest provides)
// ---------------------------------------------------------------------------

export interface ISkywardAttendanceRecord {
  readonly date: string;
  readonly period: string;
  readonly status: 'present' | 'absent' | 'tardy' | 'excused';
  readonly courseName?: string;
  readonly note?: string;
}

export interface ISkywardScheduleEntry {
  readonly period: number;
  readonly courseName: string;
  readonly courseId: number;
  readonly teacherName: string;
  readonly teacherEmail?: string;
  readonly room?: string;
}

export interface ISkywardMessage {
  readonly id: string;
  readonly subject: string;
  readonly body: string;
  readonly senderName: string;
  readonly senderRole: 'teacher' | 'admin' | 'system';
  readonly sentAt: string;
  readonly read: boolean;
  readonly courseName?: string;
}

export interface ISkywardDocument {
  readonly title: string;
  readonly courseName?: string;
  readonly courseId?: number;
  readonly type: 'document' | 'link' | 'syllabus' | 'handout' | 'other';
  readonly url?: string;
  readonly fileName?: string;
  readonly postedAt?: string;
}

// ---------------------------------------------------------------------------
// Scraper interface (matches skyward-rest API shape + extended methods)
// ---------------------------------------------------------------------------

/**
 * Core scraper interface — matches skyward-rest npm package.
 * These three methods are provided by the skyward-rest library.
 */
export interface ISkywardScraper {
  scrapeReport(user: string, pass: string): Promise<{ data: readonly ISkywardReport[] }>;
  scrapeGradebook(
    user: string,
    pass: string,
    options: { course: number; bucket: string }
  ): Promise<{ data: ISkywardGradebook }>;
  scrapeHistory(user: string, pass: string): Promise<{ data: readonly ISkywardSchoolYear[] }>;
}

/**
 * Extended scraper interface — additional data beyond what skyward-rest provides.
 * Implementations can provide these by scraping additional Skyward pages.
 * All methods are optional (use ISkywardScraper for the base interface).
 */
export interface ISkywardExtendedScraper extends ISkywardScraper {
  scrapeAttendance?(user: string, pass: string): Promise<{ data: readonly ISkywardAttendanceRecord[] }>;
  scrapeSchedule?(user: string, pass: string): Promise<{ data: readonly ISkywardScheduleEntry[] }>;
  scrapeMessages?(user: string, pass: string): Promise<{ data: readonly ISkywardMessage[] }>;
  scrapeDocuments?(user: string, pass: string, courseId?: number): Promise<{ data: readonly ISkywardDocument[] }>;
}

// ---------------------------------------------------------------------------
// Client config
// ---------------------------------------------------------------------------

export interface ISkywardClientConfig {
  readonly loginUrl: string;
  readonly username: string;
  readonly password: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * Skyward client that wraps the skyward-rest scraper interface.
 *
 * Accepts a scraper instance for dependency injection (testability).
 * In production, pass `require('skyward-rest')(loginUrl)`.
 */
export class SkywardClient {
  private readonly _config: ISkywardClientConfig;
  private readonly _scraper: ISkywardExtendedScraper;

  constructor(config: ISkywardClientConfig, scraper: ISkywardExtendedScraper) {
    this._config = config;
    this._scraper = scraper;
  }

  // -----------------------------------------------------------------------
  // Core methods (provided by skyward-rest)
  // -----------------------------------------------------------------------

  public async getReport(): Promise<readonly ISkywardReport[]> {
    const { data } = await this._scraper.scrapeReport(
      this._config.username,
      this._config.password
    );
    return data;
  }

  public async getGradebook(
    courseId: number,
    bucket: string
  ): Promise<ISkywardGradebook> {
    const { data } = await this._scraper.scrapeGradebook(
      this._config.username,
      this._config.password,
      { course: courseId, bucket }
    );
    return data;
  }

  public async getHistory(): Promise<readonly ISkywardSchoolYear[]> {
    const { data } = await this._scraper.scrapeHistory(
      this._config.username,
      this._config.password
    );
    return data;
  }

  // -----------------------------------------------------------------------
  // Extended methods (optional — depends on scraper implementation)
  // -----------------------------------------------------------------------

  public get supportsAttendance(): boolean {
    return typeof this._scraper.scrapeAttendance === 'function';
  }

  public get supportsSchedule(): boolean {
    return typeof this._scraper.scrapeSchedule === 'function';
  }

  public get supportsMessages(): boolean {
    return typeof this._scraper.scrapeMessages === 'function';
  }

  public get supportsDocuments(): boolean {
    return typeof this._scraper.scrapeDocuments === 'function';
  }

  public async getAttendance(): Promise<readonly ISkywardAttendanceRecord[]> {
    if (!this._scraper.scrapeAttendance) return [];
    const { data } = await this._scraper.scrapeAttendance(
      this._config.username,
      this._config.password
    );
    return data;
  }

  public async getSchedule(): Promise<readonly ISkywardScheduleEntry[]> {
    if (!this._scraper.scrapeSchedule) return [];
    const { data } = await this._scraper.scrapeSchedule(
      this._config.username,
      this._config.password
    );
    return data;
  }

  public async getMessages(): Promise<readonly ISkywardMessage[]> {
    if (!this._scraper.scrapeMessages) return [];
    const { data } = await this._scraper.scrapeMessages(
      this._config.username,
      this._config.password
    );
    return data;
  }

  public async getDocuments(courseId?: number): Promise<readonly ISkywardDocument[]> {
    if (!this._scraper.scrapeDocuments) return [];
    const { data } = await this._scraper.scrapeDocuments(
      this._config.username,
      this._config.password,
      courseId
    );
    return data;
  }
}
