import {
  SLC_INGEST_SCHEMA_VERSION_V1,
  type ISlcIngestEnvelopeV1,
  type ISlcDeltaOp,
} from '@scholaracle/contracts';
import type {
  ILmsAdapterWithTest,
  ILmsAdapterMeta,
  ILmsCredentials,
  IFetchEnvelopeParams,
  IConnectionTestResult,
} from '../adapter';
import { AeriesClient, type IAeriesAssignmentScore } from './aeries-client';
import {
  transformReportCardToGradeOps,
  transformReportCardAttendanceToOps,
  transformCourseToOp,
  transformAssignmentsToOps,
  transformMarkingPeriodToOp,
  transformSchoolToInstitutionOp,
  transformSectionToTeacherOp,
} from './aeries-transformer';

/**
 * Type for the scraper function — lazily imported to avoid requiring
 * Playwright at module load time (it's a devDependency).
 */
export type AeriesScraperFn = (
  url: string,
  email: string,
  password: string
) => Promise<IAeriesScrapeResult>;

/**
 * Minimal extract shape returned by the browser scraper.
 * Defined here to avoid importing the harness module (which uses DOM types).
 */
export interface IAeriesScrapeResult {
  students: Array<{
    name: string;
    studentId: string;
    grade: string;
    school: string;
    courses: Array<{
      period: string;
      name: string;
      term: string;
      teacher: string;
      teacherEmail: string;
      room: string;
      currentGrade: number | null;
      currentPercent: number | null;
      missingCount: number;
      assignments: Array<{
        number: string;
        title: string;
        category: string;
        scoreEarned: number | null;
        scorePossible: number | null;
        percentCorrect: number | null;
        dateAssigned: string;
        dateDue: string;
        dateCompleted: string;
        gradingComplete: boolean;
        isMissing: boolean;
        comment: string;
      }>;
    }>;
    attendance: Array<{
      date: string;
      period: string;
      status: string;
      reason: string;
      course: string;
    }>;
  }>;
  timestamp: string;
}

/** Which backend the adapter is using. */
export type AeriesAdapterMode = 'api' | 'scraper';

/**
 * Aeries SIS adapter.
 *
 * Supports two authentication modes:
 *
 * **API mode** (district-issued certificate):
 * - `baseUrl`  — district Aeries URL (e.g. "https://demo.aeries.net/aeries")
 * - `apiKey`   — 32-character AERIES-CERT certificate
 * - `username` — encoded as "schoolCode:studentId" (e.g. "994:99400001")
 *
 * **Scraper mode** (parent portal login):
 * - `baseUrl`  — parent portal login URL (e.g. "https://kellerisd.aeries.net/student/LoginParent.aspx")
 * - `username` — parent email address
 * - `password` — parent password
 *
 * The adapter auto-detects the mode: if `apiKey` is present it uses the API,
 * otherwise it falls back to Playwright-based scraping.
 */
export class AeriesAdapter implements ILmsAdapterWithTest {
  public readonly meta: ILmsAdapterMeta = {
    provider: 'aeries',
    adapterId: 'com.aeries.sis',
    adapterVersion: '0.1.0',
    displayName: 'Aeries SIS',
  };

  private _client: AeriesClient | undefined;
  private _scraperCredentials: { url: string; email: string; password: string } | undefined;
  private _scraperFn: AeriesScraperFn | undefined;
  private _isAuthenticated = false;
  private _mode: AeriesAdapterMode = 'api';

  /** Inject a custom scraper function (for testing or alternative implementations). */
  constructor(scraperFn?: AeriesScraperFn) {
    this._scraperFn = scraperFn;
  }

  /** Which mode this adapter is operating in after authenticate(). */
  public get mode(): AeriesAdapterMode {
    return this._mode;
  }

  public async authenticate(credentials: ILmsCredentials): Promise<void> {
    if (!credentials.baseUrl) {
      throw new Error('Aeries adapter requires a baseUrl');
    }

    // --- API mode: apiKey + schoolCode:studentId ---
    if (credentials.apiKey) {
      if (!credentials.username) {
        throw new Error(
          'Aeries API mode requires username in "schoolCode:studentId" format (e.g. "994:99400001")'
        );
      }

      const { schoolCode, studentId } = AeriesAdapter.parseUsername(credentials.username);

      this._client = new AeriesClient({
        baseUrl: credentials.baseUrl,
        apiKey: credentials.apiKey,
        schoolCode,
        studentId,
      });
      this._mode = 'api';
      this._isAuthenticated = true;
      return;
    }

    // --- Scraper mode: email + password ---
    if (credentials.username && credentials.password) {
      this._scraperCredentials = {
        url: credentials.baseUrl,
        email: credentials.username,
        password: credentials.password,
      };
      this._mode = 'scraper';
      this._isAuthenticated = true;
      return;
    }

    throw new Error(
      'Aeries adapter requires either apiKey (API mode) or username + password (scraper mode)'
    );
  }

  public isAuthenticated(): boolean {
    return this._isAuthenticated;
  }

  public async testConnection(): Promise<IConnectionTestResult> {
    const start = Date.now();
    if (!this._isAuthenticated) {
      return {
        success: false,
        message: 'Not authenticated. Call authenticate() first.',
        durationMs: Date.now() - start,
      };
    }

    if (this._mode === 'api') {
      return this._testConnectionApi(start);
    }
    return this._testConnectionScraper(start);
  }

  public async fetchEnvelope(params: IFetchEnvelopeParams): Promise<ISlcIngestEnvelopeV1> {
    if (!this._isAuthenticated) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    const now = new Date().toISOString();

    const { ops, warnings } =
      this._mode === 'api' ? await this._fetchAllOps() : await this._fetchAllOpsScraper();

    return {
      schemaVersion: SLC_INGEST_SCHEMA_VERSION_V1,
      run: {
        runId: params.runId,
        startedAt: now,
        provider: this.meta.provider,
        adapterId: this.meta.adapterId,
        adapterVersion: this.meta.adapterVersion,
        mode: 'delta',
        timezone: 'UTC',
      },
      source: {
        sourceId: params.sourceId,
        displayName: params.displayName,
        portalBaseUrl: params.portalBaseUrl,
      },
      ops,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  private async _testConnectionApi(start: number): Promise<IConnectionTestResult> {
    try {
      const [student, reportCard] = await Promise.all([
        this._client!.getStudent(),
        this._client!.getReportCard(),
      ]);
      const courseCount = reportCard.StudentReportCardCourses?.length ?? 0;
      const userName = `${student.FirstName} ${student.LastName}`.trim();
      return {
        success: true,
        message: `Connected (API) — ${userName} has ${courseCount} course${courseCount !== 1 ? 's' : ''} on report card`,
        durationMs: Date.now() - start,
        details: { courseCount, userName },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Connection failed: ${msg}`,
        durationMs: Date.now() - start,
      };
    }
  }

  private async _testConnectionScraper(start: number): Promise<IConnectionTestResult> {
    try {
      const extract = await this._runScraper();
      const student = extract.students[0];
      const courseCount = student?.courses.length ?? 0;
      const userName = student?.name ?? 'Unknown';
      return {
        success: true,
        message: `Connected (scraper) — ${userName} has ${courseCount} course${courseCount !== 1 ? 's' : ''}`,
        durationMs: Date.now() - start,
        details: { courseCount, userName },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Connection failed: ${msg}`,
        durationMs: Date.now() - start,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async _fetchAllOps(): Promise<{
    ops: readonly ISlcDeltaOp[];
    warnings: readonly string[];
  }> {
    const client = this._client!;
    const ops: ISlcDeltaOp[] = [];
    const warnings: string[] = [];

    const baseKey = {
      provider: this.meta.provider,
      adapterId: this.meta.adapterId,
      studentExternalId: 'self',
      institutionExternalId: 'aeries-instance',
    };

    // ---- Phase 1: School / Institution ----
    try {
      const school = await client.getSchool();
      ops.push(transformSchoolToInstitutionOp(school, baseKey) as unknown as ISlcDeltaOp);
    } catch {
      warnings.push('Could not fetch school information');
    }

    // ---- Phase 2: Marking Periods (terms) ----
    try {
      const markingPeriods = await client.getMarkingPeriods();
      for (const mp of markingPeriods) {
        ops.push(transformMarkingPeriodToOp(mp, baseKey) as unknown as ISlcDeltaOp);
      }
    } catch {
      warnings.push('Could not fetch marking periods');
    }

    // ---- Phase 3: Report Card (grades + attendance per course per MP) ----
    let reportCourses: readonly {
      readonly CourseID: string;
      readonly SectionNumber: number;
    }[] = [];

    try {
      const reportCard = await client.getReportCard();
      const courses = reportCard.StudentReportCardCourses ?? [];
      reportCourses = courses;

      for (const course of courses) {
        // Grade snapshot ops
        const gradeOps = transformReportCardToGradeOps(course, baseKey);
        ops.push(...(gradeOps as unknown as ISlcDeltaOp[]));

        // Attendance summary ops
        const attendanceOps = transformReportCardAttendanceToOps(course, baseKey);
        ops.push(...(attendanceOps as unknown as ISlcDeltaOp[]));
      }
    } catch {
      warnings.push('Could not fetch report card data');
    }

    // ---- Phase 4: Course details, sections, teachers ----
    const seenCourseIds = new Set<string>();

    for (const rc of reportCourses) {
      if (seenCourseIds.has(rc.CourseID)) continue;
      seenCourseIds.add(rc.CourseID);

      try {
        const [course, section] = await Promise.all([
          client.getCourse(rc.CourseID),
          client.getSection(rc.SectionNumber).catch(() => undefined),
        ]);

        ops.push(transformCourseToOp(course, section, baseKey) as unknown as ISlcDeltaOp);

        // Teacher op
        if (section) {
          const teacherOp = transformSectionToTeacherOp(section, baseKey);
          if (teacherOp) {
            ops.push(teacherOp as unknown as ISlcDeltaOp);
          }
        }
      } catch {
        warnings.push(`Could not fetch course/section details for ${rc.CourseID}`);
      }
    }

    // ---- Phase 5: Gradebook assignments + scores ----
    for (const rc of reportCourses) {
      try {
        const gradebooks = await client.getGradebooksForSection(rc.SectionNumber);

        for (const gb of gradebooks) {
          const assignments = await client.getAssignments(gb.GradebookNumber);

          // Fetch scores for each assignment
          const scoreMap = new Map<number, IAeriesAssignmentScore>();
          for (const assignment of assignments) {
            try {
              const scores = await client.getAssignmentScores(
                gb.GradebookNumber,
                assignment.AssignmentNumber
              );
              const studentScore = scores[0];
              if (studentScore) {
                scoreMap.set(assignment.AssignmentNumber, studentScore);
              }
            } catch {
              // Score may not exist for this student/assignment
            }
          }

          const assignmentOps = transformAssignmentsToOps(
            assignments,
            scoreMap,
            rc.CourseID,
            baseKey
          );
          ops.push(...(assignmentOps as unknown as ISlcDeltaOp[]));
        }
      } catch {
        warnings.push(`Could not fetch gradebook data for section ${rc.SectionNumber}`);
      }
    }

    return { ops, warnings };
  }

  // ---------------------------------------------------------------------------
  // Scraper mode
  // ---------------------------------------------------------------------------

  private async _runScraper(): Promise<IAeriesScrapeResult> {
    const creds = this._scraperCredentials!;

    if (this._scraperFn) {
      return this._scraperFn(creds.url, creds.email, creds.password);
    }

    return AeriesAdapter._runViaScraperLib(creds.url, creds.email, creds.password);
  }

  /**
   * Lazy-load AeriesScraper from scholaracle_scrapers and run the lifecycle.
   * Kept static so the class is easy to test/mock independently.
   */
  private static async _runViaScraperLib(
    url: string,
    email: string,
    password: string
  ): Promise<IAeriesScrapeResult> {
    const root = process.env['SCHOLARACLE_SCRAPERS_SRC'];
    let scraperModulePath: string;

    if (root) {
      scraperModulePath = require('path').join(root, 'src', 'scrapers', 'aeries', 'aeries-scraper');
    } else {
      try {
        const pkgPath = require.resolve('scholaracle-scraper/package.json', {
          paths: [process.cwd(), __dirname],
        });
        scraperModulePath = require('path').join(
          require('path').dirname(pkgPath),
          'src',
          'scrapers',
          'aeries',
          'aeries-scraper'
        );
      } catch {
        throw new Error(
          'scholaracle-scraper package not found. Set SCHOLARACLE_SCRAPERS_SRC or install scholaracle-scraper.'
        );
      }
    }

    require('ts-node/register');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(scraperModulePath);
    // eslint-disable-next-line @typescript-eslint/naming-convention -- class constructor reference
    const ScraperClass = mod.AeriesScraper ?? mod.default;
    if (!ScraperClass) {
      throw new Error('AeriesScraper class not found in scholaracle-scraper');
    }

    const scraper = new ScraperClass();
    try {
      await scraper.initialize({
        credentials: { baseUrl: url, username: email, password },
        studentName: '',
        studentExternalId: 'self',
        institutionExternalId: 'aeries-instance',
        sourceId: 'aeries',
        provider: 'aeries',
        adapterId: 'com.aeries.sis',
        options: { headless: true },
      });
      const authResult = await scraper.authenticate();
      if (authResult && !authResult.success) {
        throw new Error(`Authentication failed: ${authResult.message ?? 'unknown'}`);
      }
      const rawData = await scraper.scrape();
      return rawData as IAeriesScrapeResult;
    } finally {
      await scraper.cleanup().catch(() => {});
    }
  }

  private async _fetchAllOpsScraper(): Promise<{
    ops: readonly ISlcDeltaOp[];
    warnings: readonly string[];
  }> {
    const extract = await this._runScraper();
    const ops: ISlcDeltaOp[] = [];
    const warnings: string[] = [];

    const baseKey = {
      provider: this.meta.provider,
      adapterId: this.meta.adapterId,
      studentExternalId: 'self',
      institutionExternalId: 'aeries-instance',
    };

    for (const student of extract.students) {
      // Institution op
      if (student.school) {
        ops.push({
          op: 'upsert',
          entity: 'institution',
          key: {
            ...baseKey,
            externalId: `aeries-school-${student.school.replace(/\s+/g, '-').toLowerCase()}`,
          },
          observedAt: extract.timestamp,
          record: { name: student.school, type: 'school' },
        } as unknown as ISlcDeltaOp);
      }

      for (const course of student.courses) {
        const courseExtId = `aeries-course-${course.period}-${course.name.replace(/\s+/g, '-').toLowerCase()}`;

        // Course op
        ops.push({
          op: 'upsert',
          entity: 'course',
          key: { ...baseKey, externalId: courseExtId },
          observedAt: extract.timestamp,
          record: {
            title: course.name,
            courseCode: course.period,
            teacherName: course.teacher,
          },
        } as unknown as ISlcDeltaOp);

        // Teacher op (with email)
        if (course.teacher) {
          ops.push({
            op: 'upsert',
            entity: 'teacher',
            key: {
              ...baseKey,
              externalId: `aeries-teacher-${course.teacher.replace(/\s+/g, '-').toLowerCase()}`,
              courseExternalId: courseExtId,
            },
            observedAt: extract.timestamp,
            record: {
              name: course.teacher,
              email: course.teacherEmail || undefined,
            },
          } as unknown as ISlcDeltaOp);
        }

        // Grade snapshot op
        if (course.currentGrade !== null || course.currentPercent !== null) {
          ops.push({
            op: 'upsert',
            entity: 'gradeSnapshot',
            key: {
              ...baseKey,
              externalId: `aeries-grade-${course.period}-${course.term.replace(/\s+/g, '-').toLowerCase()}`,
              courseExternalId: courseExtId,
            },
            observedAt: extract.timestamp,
            record: {
              courseExternalId: courseExtId,
              percentGrade: course.currentPercent ?? undefined,
              asOfDate: extract.timestamp.split('T')[0]!,
            },
          } as unknown as ISlcDeltaOp);
        }

        // Assignment ops
        for (const assignment of course.assignments) {
          const assignExtId = `aeries-assignment-${course.period}-${assignment.number || assignment.title.replace(/\s+/g, '-').toLowerCase().slice(0, 40)}`;

          ops.push({
            op: 'upsert',
            entity: 'assignment',
            key: {
              ...baseKey,
              externalId: assignExtId,
              courseExternalId: courseExtId,
            },
            observedAt: extract.timestamp,
            record: {
              title: assignment.title,
              dueAt: assignment.dateDue ? new Date(assignment.dateDue).toISOString() : undefined,
              status: assignment.isMissing
                ? 'missing'
                : assignment.scoreEarned !== null
                  ? 'graded'
                  : assignment.dateCompleted
                    ? 'submitted'
                    : 'unknown',
              pointsPossible: assignment.scorePossible ?? undefined,
              pointsEarned: assignment.scoreEarned ?? undefined,
            },
          } as unknown as ISlcDeltaOp);
        }
      }

      // Attendance ops
      for (const att of student.attendance) {
        ops.push({
          op: 'upsert',
          entity: 'attendanceEvent',
          key: {
            ...baseKey,
            externalId: `aeries-attendance-${att.date}-${att.period}`,
          },
          observedAt: extract.timestamp,
          record: {
            date: att.date,
            status: att.status.toLowerCase().includes('absent')
              ? 'absent'
              : att.status.toLowerCase().includes('tardy')
                ? 'tardy'
                : att.status.toLowerCase().includes('excused')
                  ? 'excused'
                  : 'present',
            periodName: att.period,
            notes: [att.reason, att.course].filter(Boolean).join(' — ') || undefined,
          },
        } as unknown as ISlcDeltaOp);
      }
    }

    return { ops, warnings };
  }

  // ---------------------------------------------------------------------------
  // Static helpers
  // ---------------------------------------------------------------------------

  /**
   * Parse "schoolCode:studentId" from the username credential field.
   * @throws if the format is invalid.
   */
  public static parseUsername(username: string): {
    schoolCode: number;
    studentId: number;
  } {
    const parts = username.split(':');
    if (parts.length !== 2) {
      throw new Error(
        `Invalid username format "${username}". Expected "schoolCode:studentId" (e.g. "994:99400001").`
      );
    }
    const schoolCode = Number(parts[0]);
    const studentId = Number(parts[1]);
    if (Number.isNaN(schoolCode) || Number.isNaN(studentId)) {
      throw new Error(
        `Invalid username format "${username}". Both schoolCode and studentId must be numeric.`
      );
    }
    return { schoolCode, studentId };
  }
}
