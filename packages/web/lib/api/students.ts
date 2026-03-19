import { apiClient } from './client';

export interface IStudent {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly grade: string;
  readonly school?: string;
  readonly studentId?: string;
  readonly stats?: {
    readonly currentGPA?: number;
    readonly totalAssignments?: number;
    readonly missingAssignments?: number;
  };
  readonly dataSources?: readonly unknown[];
  readonly alertPreferences?: {
    readonly useCustomSettings?: boolean;
    readonly gradeDrop?: number;
    readonly lowGradeThreshold?: number;
    readonly frequency?: string;
  };
}

export interface ISharedParent {
  readonly userId?: string;
  readonly email?: string;
  readonly name?: string;
  readonly role: 'parent' | 'guardian' | 'caregiver';
  readonly status: 'pending' | 'accepted' | 'declined';
  readonly isOwner: boolean;
  readonly isAdmin: boolean;
  readonly invitedAt?: string;
  readonly acceptedAt?: string;
  readonly phone?: string;
  readonly receiveAlerts?: boolean;
  readonly alertChannels?: readonly ('email' | 'sms')[];
  readonly alertTypes?: readonly string[];
}

export interface IPendingInvite {
  readonly studentId: string;
  readonly studentName: string;
  readonly invitedBy: string;
  readonly invite: {
    readonly email: string;
    readonly role: string;
    readonly status: string;
    readonly invitedAt: string;
  };
}

export interface IStudentAlert {
  readonly id: string;
  readonly studentId: string;
  readonly type: string;
  readonly severity: string;
  readonly message: string;
  readonly acknowledged: boolean;
  readonly acknowledgedAt?: string;
  readonly createdAt: string;
}

export type AssignmentStatus = 'missing' | 'submitted' | 'graded' | 'late' | 'unknown';

export interface IAttachment {
  readonly name: string;
  readonly url?: string;
  readonly type?: string;
}

export interface IRubricScore {
  readonly criterion: string;
  readonly score?: number;
  readonly possiblePoints?: number;
  readonly rating?: string;
  readonly comments?: string;
}

export interface ICourseAssignment {
  readonly externalId: string;
  readonly title: string;
  readonly dueAt?: string;
  readonly status: AssignmentStatus;
  readonly pointsPossible?: number;
  readonly pointsEarned?: number;
  readonly isOverdue: boolean;
  readonly weight?: number;
  readonly category?: string;
  readonly categoryWeight?: number;
  readonly rubricScores?: readonly IRubricScore[];
  readonly attachments?: readonly IAttachment[];
}

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type GradeSource = 'sis' | 'lms' | 'computed' | 'none';

export interface ICourseGrade {
  readonly courseExternalId: string;
  readonly courseName: string;
  readonly grade: number;
  readonly letterGrade: string;
  readonly officialGrade?: number | null;
  readonly gradeSource?: GradeSource;
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
  readonly recentTrend: 'improving' | 'stable' | 'declining';
  readonly riskLevel: RiskLevel;
  readonly riskExplanation?: string;
  readonly materialCount?: number;
  readonly assignments: readonly ICourseAssignment[];
}

export interface IStudentGradesResponse {
  readonly studentId: string;
  readonly studentName: string;
  readonly overallGPA: number;
  readonly courseGrades: readonly ICourseGrade[];
  readonly atRiskCourses: number;
  readonly aiOverview?: string;
}

export interface IActionAsset {
  readonly assetId: string;
  readonly fileName: string;
  readonly materialType: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly downloadUrl: string;
}

export interface IActionItem {
  readonly assignmentExternalId: string;
  readonly title: string;
  readonly dueAt?: string;
  readonly status: string;
  readonly pointsPossible?: number;
  readonly pointsEarned?: number;
  readonly isOverdue: boolean;
  readonly course: {
    readonly externalId: string;
    readonly name: string;
    readonly currentGrade?: number;
    readonly letterGrade?: string;
    readonly riskLevel: string;
  };
  readonly assets: readonly IActionAsset[];
  readonly materials: readonly IActionAsset[];
}

export interface IActionBucket {
  readonly id: 'needs_attention' | 'due_soon' | 'in_progress' | 'recently_graded' | 'caught_up';
  readonly label: string;
  readonly count: number;
  readonly items: readonly IActionItem[];
}

export interface IActionBoardResponse {
  readonly studentId: string;
  readonly studentName: string;
  readonly buckets: readonly IActionBucket[];
}

export type WorkflowAssignmentStatus =
  | 'missing'
  | 'submitted'
  | 'graded'
  | 'late'
  | 'unknown'
  | 'not_started'
  | 'in_progress'
  | 'excused'
  | 'pending';

export interface IWorkflowAssignment {
  readonly externalId: string;
  readonly title: string;
  readonly dueAt?: string;
  readonly assignedAt?: string;
  readonly status: WorkflowAssignmentStatus;
  readonly category?: string;
  readonly pointsPossible?: number;
  readonly pointsEarned?: number;
  readonly percentScore?: number;
  readonly letterGrade?: string;
  readonly isLate: boolean;
  readonly isMissing: boolean;
  readonly isOverdue: boolean;
  readonly isUpcoming: boolean;
  readonly courseExternalId: string;
  readonly courseName: string;
  readonly courseGrade?: number;
  readonly courseLetterGrade?: string;
  readonly teacherFeedback?: string;
  readonly submittedAt?: string;
  readonly gradedAt?: string;
  readonly studentNote?: string;
  readonly studentStatus?: string;
}

export type StudentStatus = 'not_started' | 'working_on_it' | 'need_help' | 'done';

export interface IAssignmentWorkflowResponse {
  readonly studentId: string;
  readonly studentName: string;
  readonly assignments: readonly IWorkflowAssignment[];
  readonly summary: {
    readonly total: number;
    readonly missing: number;
    readonly late: number;
    readonly graded: number;
    readonly upcoming: number;
  };
}

export interface IAssignmentHistoryEntry {
  readonly observedAt: string;
  readonly status: string;
  readonly pointsEarned?: number;
  readonly pointsPossible?: number;
  readonly percentScore?: number;
  readonly letterGrade?: string;
  readonly teacherFeedback?: string;
}

export interface IAssignmentHistoryResponse {
  readonly externalId: string;
  readonly title: string;
  readonly courseName: string;
  readonly history: readonly IAssignmentHistoryEntry[];
}

export type ActivityEventType =
  | 'grade_change'
  | 'material_added'
  | 'material_removed'
  | 'material_updated'
  | 'alert_created'
  | 'comment_added'
  | 'grade_snapshot';

export interface IActivityEvent {
  readonly id: string;
  readonly eventType: ActivityEventType;
  readonly occurredAt: string;
  readonly courseExternalId?: string;
  readonly courseName?: string;
  readonly assignmentExternalId?: string;
  readonly assignmentTitle?: string;
  readonly title: string;
  readonly description?: string;
  readonly severity?: 'positive' | 'negative' | 'neutral' | 'info';
  readonly metadata?: Record<string, unknown>;
}

export interface IActivityTimelineResponse {
  readonly studentId: string;
  readonly events: readonly IActivityEvent[];
  readonly hasMore: boolean;
}

export interface IActivityTimelineFilters {
  readonly course?: string;
  readonly assignment?: string;
  readonly types?: readonly string[];
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
}

export interface ICommentResponse {
  readonly id: string;
  readonly authorEmail: string;
  readonly authorName: string;
  readonly authorRole: 'parent' | 'student' | 'owner';
  readonly body: string;
  readonly createdAt: string;
}

export interface ICreateStudentRequest {
  readonly name: string;
  readonly grade?: string;
  readonly school?: string;
}

export interface IGradeHistorySnapshot {
  readonly date: string;
  readonly percentGrade: number;
  readonly provider: string;
  readonly sourceType?: string;
}

export interface ICourseGradeHistory {
  readonly courseExternalId: string;
  readonly courseName: string;
  readonly snapshots: readonly IGradeHistorySnapshot[];
}

export interface IGradeHistoryResponse {
  readonly studentId: string;
  readonly courses: readonly ICourseGradeHistory[];
}

export interface ICourseMaterial {
  readonly externalId: string;
  readonly title: string;
  readonly type: string;
  readonly url?: string;
  readonly fileName?: string;
  readonly mimeType?: string;
  readonly postedAt?: string;
  readonly description?: string;
  readonly fileSize?: number;
  readonly assetId?: string;
  readonly downloadUrl?: string;
  /** When 'authenticated', link requires school login; show lock indicator. */
  readonly linkAccessibility?: 'public' | 'authenticated' | 'unknown';
}

export interface ICourseMaterials {
  readonly courseExternalId: string;
  readonly courseName: string;
  readonly materials: readonly ICourseMaterial[];
}

export interface IStudentMaterialsResponse {
  readonly studentId: string;
  readonly studentName: string;
  readonly totalMaterials: number;
  readonly courses: readonly ICourseMaterials[];
}

/**
 * Students API methods.
 */
export const studentsApi = {
  /**
   * Get all students for the current user.
   */
  async getAll(): Promise<readonly IStudent[]> {
    try {
      return await apiClient.get<readonly IStudent[]>('/students');
    } catch (error) {
      console.error('Failed to load students:', error);
      return [];
    }
  },

  /**
   * Get student by ID.
   */
  async getById(id: string): Promise<IStudent | null> {
    try {
      return await apiClient.get<IStudent>(`/students/${id}`);
    } catch (error) {
      console.error('Failed to load student:', error);
      return null;
    }
  },

  /**
   * Create a new student.
   */
  async create(student: ICreateStudentRequest): Promise<IStudent | null> {
    try {
      return await apiClient.post<IStudent>('/students', student);
    } catch (error) {
      console.error('Failed to create student:', error);
      return null;
    }
  },

  /**
   * Update a student.
   */
  async update(
    id: string,
    updates: Partial<ICreateStudentRequest> & {
      studentId?: string;
      alertPreferences?: IStudent['alertPreferences'];
    }
  ): Promise<IStudent | null> {
    try {
      return await apiClient.put<IStudent>(`/students/${id}`, updates);
    } catch (error) {
      console.error('Failed to update student:', error);
      return null;
    }
  },

  /**
   * Get alerts for a student.
   */
  async getAlerts(studentId: string): Promise<readonly IStudentAlert[]> {
    try {
      return await apiClient.get<readonly IStudentAlert[]>(`/students/${studentId}/alerts`);
    } catch (error) {
      console.error('Failed to load student alerts:', error);
      return [];
    }
  },

  /**
   * Delete a student.
   */
  async delete(id: string): Promise<boolean> {
    try {
      const response = await apiClient.delete<{ readonly success: boolean }>(`/students/${id}`);
      return response.success ?? false;
    } catch (error) {
      console.error('Failed to delete student:', error);
      return false;
    }
  },

  /**
   * Get per-course grades and assignment breakdown for a student.
   */
  async getGrades(id: string): Promise<IStudentGradesResponse | null> {
    try {
      return await apiClient.get<IStudentGradesResponse>(`/students/${id}/grades`);
    } catch (error) {
      console.error('Failed to load student grades:', error);
      return null;
    }
  },

  /**
   * Get action board (buckets: needs_attention, due_soon, in_progress, recently_graded, caught_up) for a student.
   */
  async getActionBoard(id: string): Promise<IActionBoardResponse | null> {
    try {
      return await apiClient.get<IActionBoardResponse>(`/students/${id}/action-board`);
    } catch (error) {
      console.error('Failed to load action board:', error);
      return null;
    }
  },

  /**
   * Get flat assignment workflow list for a student with optional filters.
   */
  async getAssignmentWorkflow(
    id: string,
    filters?: {
      readonly status?: string;
      readonly course?: string;
      readonly category?: string;
      readonly from?: string;
      readonly to?: string;
      readonly upcoming?: boolean;
    }
  ): Promise<IAssignmentWorkflowResponse | null> {
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.course) params.set('course', filters.course);
      if (filters?.category) params.set('category', filters.category);
      if (filters?.from) params.set('from', filters.from);
      if (filters?.to) params.set('to', filters.to);
      if (filters?.upcoming === true) params.set('upcoming', 'true');
      const query = params.toString() ? `?${params.toString()}` : '';
      return await apiClient.get<IAssignmentWorkflowResponse>(`/students/${id}/assignment-workflow${query}`);
    } catch (error) {
      console.error('Failed to load assignment workflow:', error);
      return null;
    }
  },

  /**
   * Get grade/status history for a single assignment.
   */
  async getAssignmentHistory(
    studentId: string,
    assignmentExternalId: string
  ): Promise<IAssignmentHistoryResponse | null> {
    try {
      return await apiClient.get<IAssignmentHistoryResponse>(
        `/students/${studentId}/assignments/${encodeURIComponent(assignmentExternalId)}/history`
      );
    } catch (error) {
      console.error('Failed to load assignment history:', error);
      return null;
    }
  },

  /**
   * Save student note ("What have you done?") for an assignment.
   */
  async saveAssignmentNote(
    studentId: string,
    assignmentExternalId: string,
    note: string
  ): Promise<boolean> {
    try {
      const res = await apiClient.put<{ success?: boolean }>(
        `/students/${studentId}/assignments/${encodeURIComponent(assignmentExternalId)}/note`,
        { note }
      );
      return res?.success ?? false;
    } catch (error) {
      console.error('Failed to save assignment note:', error);
      return false;
    }
  },

  /**
   * Set student progress status on an assignment.
   */
  async updateAssignmentStatus(
    studentId: string,
    assignmentExternalId: string,
    status: StudentStatus | null
  ): Promise<boolean> {
    try {
      const res = await apiClient.put<{ success?: boolean }>(
        `/students/${studentId}/assignments/${encodeURIComponent(assignmentExternalId)}/status`,
        { status }
      );
      return res?.success ?? false;
    } catch (error) {
      console.error('Failed to update assignment status:', error);
      return false;
    }
  },

  /**
   * Get unified activity timeline (grade changes, materials, alerts, comments, snapshots).
   */
  async getActivityTimeline(
    studentId: string,
    filters?: IActivityTimelineFilters
  ): Promise<IActivityTimelineResponse | null> {
    try {
      const params = new URLSearchParams();
      if (filters?.course) params.set('course', filters.course);
      if (filters?.assignment) params.set('assignment', filters.assignment);
      if (filters?.types?.length) params.set('types', filters.types.join(','));
      if (filters?.from) params.set('from', filters.from);
      if (filters?.to) params.set('to', filters.to);
      if (filters?.limit != null) params.set('limit', String(filters.limit));
      const query = params.toString() ? `?${params.toString()}` : '';
      return await apiClient.get<IActivityTimelineResponse>(`/students/${studentId}/activity${query}`);
    } catch (error) {
      console.error('Failed to load activity timeline:', error);
      return null;
    }
  },

  /**
   * Get comments for an assignment (chronological).
   */
  async getAssignmentComments(
    studentId: string,
    assignmentExternalId: string
  ): Promise<readonly ICommentResponse[]> {
    try {
      const list = await apiClient.get<readonly ICommentResponse[]>(
        `/students/${studentId}/assignments/${encodeURIComponent(assignmentExternalId)}/comments`
      );
      return list ?? [];
    } catch (error) {
      console.error('Failed to load assignment comments:', error);
      return [];
    }
  },

  /**
   * Add a comment on an assignment. Body and optional authorName.
   */
  async addAssignmentComment(
    studentId: string,
    assignmentExternalId: string,
    body: string,
    authorName?: string
  ): Promise<ICommentResponse | null> {
    try {
      return await apiClient.post<ICommentResponse>(
        `/students/${studentId}/assignments/${encodeURIComponent(assignmentExternalId)}/comments`,
        { body, authorName }
      );
    } catch (error) {
      console.error('Failed to add comment:', error);
      return null;
    }
  },

  /**
   * Soft-delete a comment. Author or account owner only.
   */
  async deleteAssignmentComment(
    studentId: string,
    assignmentExternalId: string,
    commentId: string
  ): Promise<boolean> {
    try {
      const res = await apiClient.delete<{ success?: boolean }>(
        `/students/${studentId}/assignments/${encodeURIComponent(assignmentExternalId)}/comments/${encodeURIComponent(commentId)}`
      );
      return res?.success ?? false;
    } catch (error) {
      console.error('Failed to delete comment:', error);
      return false;
    }
  },

  async getGradeHistory(
    id: string,
    courseExternalId?: string,
    opts?: { readonly from?: string; readonly to?: string; readonly term?: string }
  ): Promise<IGradeHistoryResponse | null> {
    try {
      const params = new URLSearchParams();
      if (courseExternalId) params.set('course', courseExternalId);
      if (opts?.from) params.set('from', opts.from);
      if (opts?.to) params.set('to', opts.to);
      if (opts?.term) params.set('term', opts.term);
      const query = params.toString() ? `?${params.toString()}` : '';
      return await apiClient.get<IGradeHistoryResponse>(`/students/${id}/grade-history${query}`);
    } catch (error) {
      console.error('Failed to load grade history:', error);
      return null;
    }
  },

  async archiveGradeHistory(id: string, before: string): Promise<void> {
    await apiClient.delete<{ readonly archived: number }>(
      `/students/${id}/grade-history?before=${encodeURIComponent(before)}`
    );
  },

  async getMaterials(
    id: string,
    opts?: { courseExternalId?: string; assignmentExternalId?: string }
  ): Promise<IStudentMaterialsResponse | null> {
    try {
      const params = new URLSearchParams();
      if (opts?.courseExternalId) params.set('course', opts.courseExternalId);
      if (opts?.assignmentExternalId) params.set('assignment', opts.assignmentExternalId);
      const query = params.toString() ? `?${params.toString()}` : '';
      return await apiClient.get<IStudentMaterialsResponse>(`/students/${id}/materials${query}`);
    } catch (error) {
      console.error('Failed to load materials:', error);
      return null;
    }
  },

  // ---------------------------------------------------------------------------
  // Parent sharing
  // ---------------------------------------------------------------------------

  async getParents(studentId: string): Promise<readonly ISharedParent[]> {
    try {
      return await apiClient.get<readonly ISharedParent[]>(`/students/${studentId}/parents`);
    } catch (error) {
      console.error('Failed to load parents:', error);
      return [];
    }
  },

  async inviteParent(
    studentId: string,
    email: string,
    role: 'parent' | 'guardian' | 'caregiver' = 'parent'
  ): Promise<{ success: boolean; message?: string }> {
    try {
      return await apiClient.post<{ success: boolean; message?: string }>(
        `/students/${studentId}/parents/invite`,
        { email, role }
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to invite parent';
      return { success: false, message: msg };
    }
  },

  async acceptInvite(studentId: string, email: string): Promise<boolean> {
    try {
      const res = await apiClient.post<{ success?: boolean }>(
        `/students/${studentId}/parents/accept`,
        { email }
      );
      return res.success ?? false;
    } catch {
      return false;
    }
  },

  async setParentAdmin(studentId: string, email: string, isAdmin: boolean): Promise<boolean> {
    try {
      const res = await apiClient.put<{ success?: boolean }>(
        `/students/${studentId}/parents/${encodeURIComponent(email)}/admin`,
        { isAdmin }
      );
      return res.success ?? false;
    } catch {
      return false;
    }
  },

  async removeParent(studentId: string, email: string): Promise<boolean> {
    try {
      const res = await apiClient.delete<{ success?: boolean }>(
        `/students/${studentId}/parents/${encodeURIComponent(email)}`
      );
      return res.success ?? false;
    } catch {
      return false;
    }
  },

  async getPendingInvites(email: string): Promise<readonly IPendingInvite[]> {
    try {
      return await apiClient.get<readonly IPendingInvite[]>(
        `/students/invites/pending?email=${encodeURIComponent(email)}`
      );
    } catch {
      return [];
    }
  },
};
