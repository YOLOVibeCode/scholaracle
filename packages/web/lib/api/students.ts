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

export interface ICourseAssignment {
  readonly externalId: string;
  readonly title: string;
  readonly dueAt?: string;
  readonly status: AssignmentStatus;
  readonly pointsPossible?: number;
  readonly pointsEarned?: number;
  readonly isOverdue: boolean;
  readonly weight?: number;
}

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface ICourseGrade {
  readonly courseExternalId: string;
  readonly courseName: string;
  readonly grade: number;
  readonly letterGrade: string;
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

  async getMaterials(id: string, courseExternalId?: string): Promise<IStudentMaterialsResponse | null> {
    try {
      const query = courseExternalId ? `?course=${encodeURIComponent(courseExternalId)}` : '';
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
