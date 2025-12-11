import { apiClient } from './client';
import { studentsApi, type IStudent } from './students';

export interface IDashboardStats {
  readonly totalStudents: number;
  readonly totalCourses: number;
  readonly totalAlerts: number;
  readonly averageGPA: number | null;
  readonly recentAlerts: readonly {
    readonly id: string;
    readonly type: string;
    readonly message: string;
    readonly createdAt: string;
  }[];
  readonly upcomingDeadlines: readonly {
    readonly id: string;
    readonly title: string;
    readonly dueDate: string;
    readonly course: string;
  }[];
}

/**
 * Dashboard API methods.
 */
export const dashboardApi = {
  /**
   * Get dashboard statistics.
   *
   * @returns Dashboard stats
   */
  async getStats(): Promise<IDashboardStats> {
    try {
      const students = await studentsApi.getAll();

      // Calculate stats from students
      const totalStudents = students.length;
      let totalCourses = 0;
      let totalAlerts = 0;
      let totalGPA = 0;
      let studentsWithGPA = 0;

      students.forEach((student) => {
        if (student.stats) {
          if (student.stats.currentGPA !== undefined) {
            totalGPA += student.stats.currentGPA;
            studentsWithGPA++;
          }
          // Estimate courses from assignments (rough estimate)
          if (student.stats.totalAssignments) {
            totalCourses += Math.ceil(student.stats.totalAssignments / 10);
          }
          if (student.stats.missingAssignments) {
            totalAlerts += student.stats.missingAssignments;
          }
        }
      });

      const averageGPA = studentsWithGPA > 0 ? totalGPA / studentsWithGPA : null;

      // TODO: Fetch real alerts and deadlines from API
      const recentAlerts: IDashboardStats['recentAlerts'] = [];
      const upcomingDeadlines: IDashboardStats['upcomingDeadlines'] = [];

      return {
        totalStudents,
        totalCourses,
        totalAlerts,
        averageGPA,
        recentAlerts,
        upcomingDeadlines,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load dashboard stats:', error);
      return {
        totalStudents: 0,
        totalCourses: 0,
        totalAlerts: 0,
        averageGPA: null,
        recentAlerts: [],
        upcomingDeadlines: [],
      };
    }
  },
};

