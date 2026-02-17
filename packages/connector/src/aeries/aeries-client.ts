/**
 * Aeries SIS REST API v5 client.
 *
 * Authenticates via the `AERIES-CERT` header with a 32-character
 * district-issued certificate. All endpoints require a school code;
 * student-scoped endpoints additionally require a student ID.
 *
 * @see https://support.aeries.com/support/solutions/articles/14000077926
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface IAeriesClientConfig {
  /** Base URL of the Aeries instance (e.g. "https://demo.aeries.net/aeries"). */
  readonly baseUrl: string;
  /** 32-character district-issued API certificate (case-sensitive). */
  readonly apiKey: string;
  /** Aeries school code (typically 1–999). */
  readonly schoolCode: number;
  /** Aeries student district ID. */
  readonly studentId: number;
}

// ---------------------------------------------------------------------------
// Response shapes (read-only, matching the Aeries JSON contract)
// ---------------------------------------------------------------------------

export interface IAeriesSchool {
  readonly SchoolCode: number;
  readonly SchoolName: string;
  readonly Address: string;
  readonly City: string;
  readonly State: string;
  readonly ZipCode: string;
  readonly PrincipalName: string;
  readonly PrincipalEmailAddress: string;
  readonly AttendancePeriod: string;
}

export interface IAeriesStudent {
  readonly StudentID: number;
  readonly SchoolCode: number;
  readonly FirstName: string;
  readonly LastName: string;
  readonly MiddleName: string;
  readonly Grade: number;
  readonly GradeLevelShortDescription: string;
  readonly StudentEmailAddress: string;
  readonly SchoolEnterDate: string | null;
}

export interface IAeriesMarkingPeriodGrade {
  readonly PrimaryStaffID: number;
  readonly MarkingPeriod: number;
  readonly Mark: string;
  readonly Credit: number;
  readonly Comment1Code: string;
  readonly Comment2Code: string;
  readonly Comment3Code: string;
  readonly CitizenshipCode: string;
  readonly WorkHabitsCode: string;
  readonly TotalAbsences: number;
  readonly TotalTardies: number;
  readonly TotalDaysEnrolled: number;
  readonly TotalDaysPresent: number;
  readonly TotalExcusedAbsences: number;
  readonly TotalUnExcusedAbsences: number;
  readonly TotalDaysOfSuspension: number;
}

export interface IAeriesReportCardCourse {
  readonly SchoolCode: number;
  readonly CourseID: string;
  readonly CourseTitle: string;
  readonly Period: string;
  readonly SectionNumber: number;
  readonly TeacherNumber: number;
  readonly MarkingPeriodGrades: readonly IAeriesMarkingPeriodGrade[];
}

export interface IAeriesReportCard {
  readonly StudentID: number;
  readonly StudentReportCardCourses: readonly IAeriesReportCardCourse[];
}

export interface IAeriesMarkingPeriod {
  readonly BeginningDate: string;
  readonly EndingDate: string;
  readonly StateReportingCode: string;
  readonly MarkingPeriod: number;
  readonly ShortDescription: string;
  readonly LongDescription: string;
  readonly IsCurrentMarkingPeriod: boolean;
}

export interface IAeriesGpa {
  readonly StudentID: number;
  readonly SchoolCode: number;
  readonly GPA_CumulativeAcademic: number;
  readonly GPA_CumulativeTotal: number;
  readonly GPA_CumulativeAcademicNonWeighted: number;
  readonly GPA_GradeReportingAcademic: number;
  readonly GPA_GradeReportingTotal: number;
  readonly ClassRank: number;
  readonly ClassSize: number;
  readonly CreditsAttempted: number;
  readonly CreditsCompleted: number;
}

export interface IAeriesClassScheduleEntry {
  readonly StudentID: number;
  readonly SchoolCode: number;
  readonly SequenceNumber: number;
  readonly SectionNumber: number;
  readonly CourseID: string;
  readonly DateStarted: string;
  readonly DateEnded: string;
}

export interface IAeriesCourse {
  readonly ID: string;
  readonly Title: string;
  readonly LongDescription: string;
  readonly DepartmentCode: string;
  readonly SubjectArea1Code: string;
  readonly SubjectArea2Code: string;
  readonly CreditDefault: number;
  readonly TermTypeCode: string;
  readonly LowGrade: number;
  readonly HighGrade: number;
  readonly NonAcademicOrHonorsCode: string;
  readonly PhysicalEducationIndicator: boolean;
}

export interface IAeriesSectionStaff {
  readonly StaffID: number;
  readonly LastName: string;
  readonly FirstName: string;
  readonly IsPrimaryTeacher: boolean;
}

export interface IAeriesSection {
  readonly SchoolCode: number;
  readonly SectionNumber: number;
  readonly Period: string;
  readonly Semester: string;
  readonly CourseID: string;
  readonly SectionStaffMembers: readonly IAeriesSectionStaff[];
  readonly Room: string;
  readonly TotalStudents: number;
}

export interface IAeriesGradebookTerm {
  readonly Code: string;
  readonly Name: string;
  readonly StartDate: string;
  readonly EndDate: string;
  readonly GradebookNumber: number;
}

export interface IAeriesAssignmentCategory {
  readonly Code: string;
  readonly Color: string;
  readonly Description: string;
  readonly GradebookNumber: number;
  readonly PercentageOfGrade: number;
}

export interface IAeriesGradebook {
  readonly GradebookNumber: number;
  readonly Name: string;
  readonly Period: string;
  readonly SchoolCode: number;
  readonly StartDate: string;
  readonly EndDate: string;
  readonly TeacherName: string;
  readonly TeacherEmailAddress: string;
  readonly TeacherNumber: number;
  readonly AssignmentCategories: readonly IAeriesAssignmentCategory[];
  readonly Terms: readonly IAeriesGradebookTerm[];
}

export interface IAeriesAssignment {
  readonly AssignmentNumber: number;
  readonly GradebookNumber: number;
  readonly Description: string;
  readonly Comment: string;
  readonly DateAssigned: string;
  readonly DateDue: string;
  readonly PointsPossible: number;
  readonly NumberCorrectPossible: number;
  readonly GradingCompleted: boolean;
  readonly FormativeSummativeIndicator: string;
  readonly UniqueID: string;
  readonly VisibleToParents: boolean;
  readonly ScoresVisibleToParents: boolean;
  readonly AssignmentCategory?: IAeriesAssignmentCategory;
}

export interface IAeriesAssignmentScore {
  readonly StudentID: number;
  readonly AssignmentNumber: number;
  readonly GradebookNumber: number;
  readonly Mark: string;
  readonly NumberCorrect: number;
  readonly NumberCorrectPossible: number;
  readonly PointsEarned: number;
  readonly PointsPossible: number;
  readonly PercentCorrect: number;
  readonly DateCompleted: string | null;
  readonly IsMissing: boolean;
}

export interface IAeriesGradebookStudent {
  readonly StudentID: number;
  readonly CurrentMark: string;
  readonly CurrentPercentage: number;
  readonly CurrentTerm: string;
  readonly StudentFirstName: string;
  readonly StudentLastName: string;
  readonly StudentGradeLevel: number;
  readonly SchoolCode: number;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class AeriesClient {
  private readonly _config: IAeriesClientConfig;

  constructor(config: IAeriesClientConfig) {
    this._config = config;
  }

  // ---- School-level ----

  public async getSchools(): Promise<readonly IAeriesSchool[]> {
    return this._get<IAeriesSchool[]>('/api/v5/schools');
  }

  public async getSchool(): Promise<IAeriesSchool> {
    const [school] = await this._get<IAeriesSchool[]>(
      `/api/v5/schools/${this._config.schoolCode}`
    );
    return school!;
  }

  // ---- Student ----

  public async getStudent(): Promise<IAeriesStudent> {
    const students = await this._get<IAeriesStudent[]>(
      `/api/v5/schools/${this._config.schoolCode}/students/${this._config.studentId}`
    );
    return students[0]!;
  }

  // ---- Report Cards (grades per marking period per course) ----

  public async getReportCard(): Promise<IAeriesReportCard> {
    const reports = await this._get<IAeriesReportCard[]>(
      `/api/v5/schools/${this._config.schoolCode}/ReportCard/${this._config.studentId}`
    );
    return reports[0]!;
  }

  // ---- Marking Periods (term definitions) ----

  public async getMarkingPeriods(): Promise<readonly IAeriesMarkingPeriod[]> {
    return this._get<IAeriesMarkingPeriod[]>(
      `/api/v5/schools/${this._config.schoolCode}/ReportCardMarkingPeriods`
    );
  }

  // ---- GPAs ----

  public async getGpa(): Promise<IAeriesGpa> {
    const gpas = await this._get<IAeriesGpa[]>(
      `/api/v5/schools/${this._config.schoolCode}/gpas/${this._config.studentId}`
    );
    return gpas[0]!;
  }

  // ---- Class Schedule ----

  public async getClassSchedule(): Promise<readonly IAeriesClassScheduleEntry[]> {
    return this._get<IAeriesClassScheduleEntry[]>(
      `/api/v5/schools/${this._config.schoolCode}/classes/${this._config.studentId}`
    );
  }

  // ---- Courses (district-wide catalog) ----

  public async getCourse(courseId: string): Promise<IAeriesCourse> {
    const courses = await this._get<IAeriesCourse[]>(`/api/v5/courses/${courseId}`);
    return courses[0]!;
  }

  // ---- Sections (master schedule) ----

  public async getSection(sectionNumber: number): Promise<IAeriesSection> {
    const sections = await this._get<IAeriesSection[]>(
      `/api/v5/schools/${this._config.schoolCode}/sections/${sectionNumber}`
    );
    return sections[0]!;
  }

  // ---- Gradebooks ----

  public async getGradebooksForSection(
    sectionNumber: number
  ): Promise<readonly IAeriesGradebook[]> {
    return this._get<IAeriesGradebook[]>(
      `/api/v5/schools/${this._config.schoolCode}/sections/${sectionNumber}/gradebooks`
    );
  }

  public async getAssignments(
    gradebookNumber: number
  ): Promise<readonly IAeriesAssignment[]> {
    return this._get<IAeriesAssignment[]>(
      `/api/v5/gradebooks/${gradebookNumber}/assignments`
    );
  }

  public async getAssignmentScores(
    gradebookNumber: number,
    assignmentNumber: number
  ): Promise<readonly IAeriesAssignmentScore[]> {
    return this._get<IAeriesAssignmentScore[]>(
      `/api/v5/gradebooks/${gradebookNumber}/assignments/${assignmentNumber}/scores/${this._config.studentId}`
    );
  }

  public async getGradebookStudents(
    gradebookNumber: number,
    termCode: string
  ): Promise<readonly IAeriesGradebookStudent[]> {
    return this._get<IAeriesGradebookStudent[]>(
      `/api/v5/gradebooks/${gradebookNumber}/${termCode}/students/${this._config.studentId}`
    );
  }

  // ---- Internal ----

  private async _get<T>(path: string): Promise<T> {
    const url = `${this._config.baseUrl}${path}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'AERIES-CERT': this._config.apiKey,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Aeries API ${res.status} ${res.statusText}: ${text}`);
    }

    return (await res.json()) as T;
  }
}
