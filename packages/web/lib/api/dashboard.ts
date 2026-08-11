import { studentsApi } from './students';
import { alertsApi } from './alerts';
import { agendaApi } from './agenda';
import { MemoryCacheService } from '../cache';
import { reportClientError } from '@/lib/errors/reporting';

// Cache instance (ISP: Separate cache from API logic)
const cache = new MemoryCacheService();
const CACHE_KEY_STATS = 'dashboard:stats';
const CACHE_TTL_SECONDS = 60; // Cache for 1 minute

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
    // Check cache first (ISP: Caching is separate concern)
    const cached = await cache.get<IDashboardStats>(CACHE_KEY_STATS);
    if (cached) {
      return cached;
    }

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

    // Fetch real alerts and deadlines from API
    let recentAlerts: IDashboardStats['recentAlerts'] = [];
    let upcomingDeadlines: IDashboardStats['upcomingDeadlines'] = [];

    try {
      // Fetch alerts (unacknowledged, sorted by most recent)
      const allAlerts = await alertsApi.getAll();
      if (Array.isArray(allAlerts)) {
        recentAlerts = allAlerts
          .filter((alert) => !alert.acknowledged)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 5) // Show top 5 most recent
          .map((alert) => ({
            id: alert.id,
            type: alert.type,
            message: alert.message,
            createdAt: alert.createdAt,
          }));
      }

      // Fetch upcoming agenda items (next 7 days)
      const now = new Date();
      const from = new Date(now.getTime());
      from.setHours(0, 0, 0, 0);
      const to = new Date(from.getTime() + 7 * 24 * 60 * 60_000);

      const agendaResponse = await agendaApi.getRange(from.toISOString(), to.toISOString());
      if (agendaResponse.success && agendaResponse.data) {
        // Filter to only assignments (not events) and sort by due date
        const assignments = agendaResponse.data.items
          .filter((item) => item.type === 'assignment')
          .sort((a, b) => new Date(a.timeAt).getTime() - new Date(b.timeAt).getTime())
          .slice(0, 5); // Show top 5 upcoming

        upcomingDeadlines = assignments.map((item) => ({
          id: item.id,
          title: item.title,
          dueDate: item.timeAt,
          course: item.courseName ?? item.courseExternalId ?? 'Course',
        }));
      }
    } catch (error) {
      // Partial degradation: stats still render without alerts/deadlines,
      // but the failure is reported instead of silently dropped.
      reportClientError(error, { source: 'dashboard.getStats.alertsAgenda' });
    }

    const stats: IDashboardStats = {
      totalStudents,
      totalCourses,
      totalAlerts,
      averageGPA,
      recentAlerts,
      upcomingDeadlines,
    };

    // Cache the result (ISP: Caching is separate concern)
    await cache.set(CACHE_KEY_STATS, stats, CACHE_TTL_SECONDS);

    return stats;
  },
};

