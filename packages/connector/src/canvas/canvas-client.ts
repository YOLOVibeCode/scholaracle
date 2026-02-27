import { getJson } from '../http';

export interface ICanvasCourse {
  readonly id: number;
  readonly name: string;
  readonly course_code: string;
  readonly enrollment_term_id: number;
  readonly time_zone: string;
  readonly syllabus_body?: string;
  readonly start_at?: string;
  readonly end_at?: string;
  readonly total_students?: number;
}

export interface ICanvasAssignment {
  readonly id: number;
  readonly name: string;
  readonly course_id: number;
  readonly due_at: string | null;
  readonly lock_at?: string | null;
  readonly unlock_at?: string | null;
  readonly points_possible: number;
  readonly submission_types: readonly string[];
  readonly has_submitted_submissions: boolean;
  readonly description?: string;
  readonly assignment_group_id?: number;
  readonly position?: number;
  readonly grading_type?: string;
  readonly published?: boolean;
  readonly html_url?: string;
}

export interface ICanvasSubmission {
  readonly id: number;
  readonly assignment_id: number;
  readonly user_id: number;
  readonly score: number | null;
  readonly grade: string | null;
  readonly workflow_state: 'submitted' | 'unsubmitted' | 'graded' | 'pending_review';
  readonly submitted_at: string | null;
  readonly late: boolean;
  readonly missing: boolean;
  readonly excused?: boolean;
  readonly grade_matches_current_submission?: boolean;
}

export interface ICanvasCalendarEvent {
  readonly id: number;
  readonly title: string;
  readonly start_at: string;
  readonly end_at: string;
  readonly type: string;
  readonly context_code: string;
  readonly description?: string;
  readonly html_url?: string;
}

export interface ICanvasEnrollment {
  readonly id: number;
  readonly course_id: number;
  readonly user_id: number;
  readonly type: string;
  readonly enrollment_state: string;
  readonly grades?: {
    readonly current_score?: number;
    readonly current_grade?: string;
    readonly final_score?: number;
    readonly final_grade?: string;
    readonly html_url?: string;
  };
}

export interface ICanvasAssignmentGroup {
  readonly id: number;
  readonly name: string;
  readonly position: number;
  readonly group_weight: number;
  readonly rules?: Record<string, unknown>;
}

export interface ICanvasModule {
  readonly id: number;
  readonly name: string;
  readonly position: number;
  readonly unlock_at?: string;
  readonly items_count: number;
  readonly state?: string;
  readonly completed_at?: string;
}

export interface ICanvasModuleItem {
  readonly id: number;
  readonly module_id: number;
  readonly title: string;
  readonly position: number;
  readonly type: string;
  readonly content_id?: number;
  readonly html_url?: string;
  readonly url?: string;
  readonly completion_requirement?: {
    readonly type: string;
    readonly completed?: boolean;
    readonly min_score?: number;
  };
}

export interface ICanvasTodoItem {
  readonly type: string;
  readonly assignment?: ICanvasAssignment;
  readonly context_type: string;
  readonly course_id: number;
  readonly html_url: string;
  readonly needs_grading_count?: number;
}

export interface ICanvasUserProfile {
  readonly id: number;
  readonly name: string;
  readonly short_name?: string;
  readonly login_id?: string;
  readonly avatar_url?: string;
  readonly primary_email?: string;
}

export interface ICanvasFile {
  readonly id: number;
  readonly display_name: string;
  readonly filename: string;
  readonly url: string;
  readonly size: number;
  readonly content_type: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly folder_id: number;
  readonly thumbnail_url?: string;
}

export interface ICanvasFolder {
  readonly id: number;
  readonly name: string;
  readonly full_name: string;
  readonly files_count: number;
  readonly folders_count: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly parent_folder_id?: number;
}

export interface ICanvasPage {
  readonly page_id: number;
  readonly url: string;
  readonly title: string;
  readonly body?: string;
  readonly published: boolean;
  readonly created_at: string;
  readonly updated_at: string;
  readonly html_url?: string;
}

export interface ICanvasAnnouncement {
  readonly id: number;
  readonly title: string;
  readonly message: string;
  readonly posted_at: string;
  readonly context_code: string;
  readonly html_url?: string;
  readonly author?: { display_name?: string };
}

export interface ICanvasDiscussionTopic {
  readonly id: number;
  readonly title: string;
  readonly message?: string;
  readonly posted_at: string;
  readonly discussion_type: string;
  readonly html_url?: string;
  readonly author?: { display_name?: string };
  readonly assignment_id?: number;
}

export interface ICanvasRubric {
  readonly id: number;
  readonly title: string;
  readonly points_possible: number;
  readonly data?: readonly {
    readonly description: string;
    readonly long_description?: string;
    readonly points: number;
    readonly ratings?: readonly { readonly description: string; readonly points: number }[];
  }[];
}

export interface ICanvasClientConfig {
  readonly baseUrl: string;
  readonly accessToken: string;
}

/**
 * Canvas LMS REST API client.
 * Handles pagination via Link headers.
 */
export class CanvasClient {
  private readonly _config: ICanvasClientConfig;

  constructor(config: ICanvasClientConfig) {
    this._config = config;
  }

  /**
   * Lightweight ping: fetch the current user profile.
   * Used by testConnection() to verify the token is valid.
   */
  public async getSelf(): Promise<{ id: number; name: string }> {
    const { data } = await getJson<{ id: number; name: string }>(
      `${this._config.baseUrl}/api/v1/users/self`,
      this._config.accessToken
    );
    return data;
  }

  public async getCourses(): Promise<readonly ICanvasCourse[]> {
    return this._paginatedGet<ICanvasCourse>('/api/v1/courses', {
      enrollment_state: 'active',
      per_page: '100',
    });
  }

  public async getAssignments(courseId: number): Promise<readonly ICanvasAssignment[]> {
    return this._paginatedGet<ICanvasAssignment>(`/api/v1/courses/${courseId}/assignments`, {
      per_page: '100',
    });
  }

  public async getSubmissions(courseId: number): Promise<readonly ICanvasSubmission[]> {
    return this._paginatedGet<ICanvasSubmission>(
      `/api/v1/courses/${courseId}/students/submissions`,
      { 'student_ids[]': 'all', per_page: '100' }
    );
  }

  public async getCalendarEvents(
    startDate: string,
    endDate: string
  ): Promise<readonly ICanvasCalendarEvent[]> {
    return this._paginatedGet<ICanvasCalendarEvent>('/api/v1/calendar_events', {
      start_date: startDate,
      end_date: endDate,
      per_page: '100',
    });
  }

  /** Get enrollments for a course (includes current grade/score). */
  public async getEnrollments(courseId: number): Promise<readonly ICanvasEnrollment[]> {
    return this._paginatedGet<ICanvasEnrollment>(`/api/v1/courses/${courseId}/enrollments`, {
      per_page: '100',
    });
  }

  /** Get assignment groups (categories like "Homework", "Tests"). */
  public async getAssignmentGroups(courseId: number): Promise<readonly ICanvasAssignmentGroup[]> {
    return this._paginatedGet<ICanvasAssignmentGroup>(
      `/api/v1/courses/${courseId}/assignment_groups`,
      {
        per_page: '100',
      }
    );
  }

  /** Get modules for a course (ordered content structure). */
  public async getModules(courseId: number): Promise<readonly ICanvasModule[]> {
    return this._paginatedGet<ICanvasModule>(`/api/v1/courses/${courseId}/modules`, {
      per_page: '100',
    });
  }

  /** Get items within a module. */
  public async getModuleItems(
    courseId: number,
    moduleId: number
  ): Promise<readonly ICanvasModuleItem[]> {
    return this._paginatedGet<ICanvasModuleItem>(
      `/api/v1/courses/${courseId}/modules/${moduleId}/items`,
      {
        per_page: '100',
      }
    );
  }

  /** Get the current user's TODO items (upcoming assignments). */
  public async getTodos(): Promise<readonly ICanvasTodoItem[]> {
    return this._paginatedGet<ICanvasTodoItem>('/api/v1/users/self/todo', {
      per_page: '100',
    });
  }

  /** Get upcoming events (combines calendar + assignments). */
  public async getUpcomingEvents(): Promise<readonly ICanvasCalendarEvent[]> {
    return this._paginatedGet<ICanvasCalendarEvent>('/api/v1/users/self/upcoming_events', {
      per_page: '100',
    });
  }

  /** Get missing assignments for the current user. */
  public async getMissingSubmissions(): Promise<
    readonly (ICanvasAssignment & { course_id: number })[]
  > {
    return this._paginatedGet<ICanvasAssignment & { course_id: number }>(
      '/api/v1/users/self/missing_submissions',
      { per_page: '100' }
    );
  }

  /** Get courses with syllabus body included. */
  public async getCoursesWithSyllabus(): Promise<readonly ICanvasCourse[]> {
    return this._paginatedGet<ICanvasCourse>('/api/v1/courses', {
      enrollment_state: 'active',
      include: 'syllabus_body',
      per_page: '100',
    });
  }

  /** Get all files in a course. */
  public async getFiles(courseId: number): Promise<readonly ICanvasFile[]> {
    return this._paginatedGet<ICanvasFile>(`/api/v1/courses/${courseId}/files`, {
      per_page: '100',
    });
  }

  /** Get folder structure for a course. */
  public async getFolders(courseId: number): Promise<readonly ICanvasFolder[]> {
    return this._paginatedGet<ICanvasFolder>(`/api/v1/courses/${courseId}/folders`, {
      per_page: '100',
    });
  }

  /** Get wiki pages for a course. */
  public async getPages(courseId: number): Promise<readonly ICanvasPage[]> {
    return this._paginatedGet<ICanvasPage>(`/api/v1/courses/${courseId}/pages`, {
      per_page: '100',
    });
  }

  /** Get a single page with full body. */
  public async getPage(courseId: number, pageUrl: string): Promise<ICanvasPage> {
    const { data } = await getJson<ICanvasPage>(
      `${this._config.baseUrl}/api/v1/courses/${courseId}/pages/${pageUrl}`,
      this._config.accessToken
    );
    return data;
  }

  /** Get announcements (across courses). */
  public async getAnnouncements(
    contextCodes: readonly string[]
  ): Promise<readonly ICanvasAnnouncement[]> {
    return this._paginatedGet<ICanvasAnnouncement>('/api/v1/announcements', {
      ...Object.fromEntries(contextCodes.map((c, i) => [`context_codes[${i}]`, c])),
      per_page: '50',
    });
  }

  /** Get discussion topics for a course. */
  public async getDiscussionTopics(courseId: number): Promise<readonly ICanvasDiscussionTopic[]> {
    return this._paginatedGet<ICanvasDiscussionTopic>(
      `/api/v1/courses/${courseId}/discussion_topics`,
      {
        per_page: '50',
      }
    );
  }

  /** Get rubrics for a course. */
  public async getRubrics(courseId: number): Promise<readonly ICanvasRubric[]> {
    return this._paginatedGet<ICanvasRubric>(`/api/v1/courses/${courseId}/rubrics`, {
      per_page: '50',
    });
  }

  /** Get user profile. */
  public async getUserProfile(): Promise<ICanvasUserProfile> {
    const { data } = await getJson<ICanvasUserProfile>(
      `${this._config.baseUrl}/api/v1/users/self/profile`,
      this._config.accessToken
    );
    return data;
  }

  private async _paginatedGet<T>(
    path: string,
    params?: Record<string, string>
  ): Promise<readonly T[]> {
    const results: T[] = [];
    let url = this._buildUrl(path, params);

    while (url) {
      const { data, headers } = await getJson<T[]>(url, this._config.accessToken);
      results.push(...data);
      url = this._parseNextLink(headers);
    }

    return results;
  }

  private _buildUrl(path: string, params?: Record<string, string>): string {
    const base = `${this._config.baseUrl}${path}`;
    if (!params || Object.keys(params).length === 0) return base;

    const search = new URLSearchParams(params).toString();
    return `${base}?${search}`;
  }

  private _parseNextLink(headers: Headers): string {
    const linkHeader = headers.get('link');
    if (!linkHeader) return '';

    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    return nextMatch?.[1] ?? '';
  }
}
