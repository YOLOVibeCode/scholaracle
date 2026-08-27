/**
 * Wire contract for GET /api/students/:id/grades.
 *
 * Server is source of truth: packages/api/src/routes/students/students.ts
 * (grades handler). Web keeps a hand-mirror at packages/web/lib/api/students.ts
 * — update it manually if this changes.
 */

export type GradeSource = 'sis' | 'lms' | 'computed' | 'none';
export type GradeTrend = 'improving' | 'stable' | 'declining';
export type CourseRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type CourseAssignmentStatus = 'missing' | 'submitted' | 'graded' | 'late' | 'unknown';

export interface ICourseGradeRubricScore {
  readonly criterion: string;
  readonly score?: number;
  readonly possiblePoints?: number;
  readonly rating?: string;
  readonly comments?: string;
}

export interface ICourseGradeAttachment {
  readonly name: string;
  readonly url?: string;
  readonly type?: string;
  /**
   * Signed URL for attachments hosted on our own asset server (24h TTL, no
   * auth header needed). Absent for raw school-portal URLs. Never cache.
   */
  readonly downloadUrl?: string;
}

export interface ICourseGradeAssignment {
  readonly externalId: string;
  readonly title: string;
  readonly dueAt?: string;
  readonly status: CourseAssignmentStatus;
  readonly pointsPossible?: number;
  readonly pointsEarned?: number;
  readonly isOverdue: boolean;
  readonly weight?: number;
  readonly category?: string;
  readonly categoryWeight?: number;
  readonly rubricScores?: readonly ICourseGradeRubricScore[];
  readonly attachments?: readonly ICourseGradeAttachment[];
  /**
   * Assignment instructions / description HTML as scraped from the LMS.
   * Strip tags client-side for display; keep raw for link extraction.
   */
  readonly description?: string;
  /** Direct link to the assignment on the school portal (LMS URL). */
  readonly lmsUrl?: string;
}

export interface ICourseGrade {
  readonly courseExternalId: string;
  readonly courseName: string;
  readonly officialGrade: number | null;
  readonly letterGrade: string | null;
  readonly gradeSource: GradeSource;
  readonly gradeBreakdown?: {
    readonly sisGrade?: number;
    readonly lmsGrade?: number;
    readonly computedGrade?: number;
  };
  readonly totalAssignments: number;
  readonly gradedAssignments: number;
  readonly missingAssignments: number;
  readonly lateAssignments: number;
  readonly totalPointsPossible: number;
  readonly totalPointsEarned: number;
  readonly recentTrend: GradeTrend;
  readonly riskLevel: CourseRiskLevel;
  readonly riskExplanation?: string;
  readonly materialCount: number;
  readonly assignments: readonly ICourseGradeAssignment[];
}

export interface IStudentGradesResponse {
  /** Echo of the :id path param (the Mongo ObjectId string). */
  readonly studentId: string;
  readonly studentName: string;
  /**
   * student.stats.currentGPA when present; otherwise the mean of non-null
   * officialGrade values (a 0-100 percentage, NOT a 4.0 GPA), rounded to 1dp.
   */
  readonly overallGPA: number;
  readonly courseGrades: readonly ICourseGrade[];
  readonly atRiskCourses: number;
  readonly aiOverview?: string;
}
