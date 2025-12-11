import { apiClient } from './client';

export interface IStudent {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly grade: string;
  readonly school: string;
  readonly stats?: {
    readonly currentGPA?: number;
    readonly totalAssignments?: number;
    readonly missingAssignments?: number;
  };
}

export interface ICreateStudentRequest {
  readonly name: string;
  readonly grade?: string;
  readonly school?: string;
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
  async update(id: string, updates: Partial<ICreateStudentRequest>): Promise<IStudent | null> {
    try {
      return await apiClient.put<IStudent>(`/students/${id}`, updates);
    } catch (error) {
      console.error('Failed to update student:', error);
      return null;
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
};
